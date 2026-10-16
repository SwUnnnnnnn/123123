import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, firebaseReady, persistenceReady } from "./firebase-client.js";
import { createProfileImageDataUrl } from "./profile-image.js";

const savedTheme = localStorage.getItem('vkt-theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';
const defaultAccent = '#7658e8';
const savedAccent = localStorage.getItem('vkt-accent');
const initialAccent = /^#[0-9a-f]{6}$/i.test(savedAccent || '') ? savedAccent : defaultAccent;
document.documentElement.dataset.theme = initialTheme;

const navItems = [...document.querySelectorAll('.nav-item[data-view], .mobile-nav-item[data-view]')];
const panels = [...document.querySelectorAll('.view-panel[data-panel]')];
const mobileView = document.querySelector('#mobile-view');
const musicTransport = document.querySelector('#music-transport');
const toast = document.querySelector('#toast');
const accountMenu = document.querySelector('.account-menu');
const accountMenuToggle = document.querySelector('#account-menu-toggle');
const accountMenuPanel = document.querySelector('#account-menu-panel');
const notificationsToggle = document.querySelector('#notifications-toggle');
const notificationsPanel = document.querySelector('#notifications-panel');
const notificationsClose = document.querySelector('#notifications-close');
const notificationCount = document.querySelector('#notification-count');
const notificationList = document.querySelector('#notification-list');
const registeredUsersList = document.querySelector('#registered-users-list');
const registeredUsersCount = document.querySelector('#registered-users-count');
const friendsStatus = document.querySelector('#friends-status');
const findFriendsButton = document.querySelector('#find-friends-button');
const chatItems = document.querySelector('#chat-items');
const chatSearch = document.querySelector('#chat-search');
const chatListTitle = document.querySelector('#chat-list-title');
const archiveToggle = document.querySelector('#archive-toggle');
const messenger = document.querySelector('.messenger');
const mobileChatBackButton = document.querySelector('#mobile-chat-back');
const conversationPlaceholder = document.querySelector('#conversation-placeholder');
const conversationContent = document.querySelector('#conversation-content');
const chatMessages = document.querySelector('#chat-messages');
const chatMessageForm = document.querySelector('#chat-message-form');
const chatMessageInput = document.querySelector('#chat-message-input');
const chatEmojiToggle = document.querySelector('#chat-emoji-toggle');
const chatEmojiPicker = document.querySelector('#chat-emoji-picker');
const voiceRecordButton = document.querySelector('#chat-voice-record');
const voiceStopButton = document.querySelector('#chat-voice-stop');
const voiceRecordingStatus = document.querySelector('#chat-voice-status');
const profileMessageButton = document.querySelector('#public-profile-message');
const profileBlockButton = document.querySelector('#public-profile-block');
const profileEditDialog = document.querySelector('#profile-edit-dialog');
const profileEditOpenButton = document.querySelector('#profile-edit-open');
const profileEditCloseButton = document.querySelector('#profile-edit-close');
const profileEditForm = document.querySelector('#profile-edit-form');
const profileFirstNameInput = document.querySelector('#profile-first-name');
const profileLastNameInput = document.querySelector('#profile-last-name');
const profileNicknameInput = document.querySelector('#profile-nickname');
const profileEditSaveButton = document.querySelector('#profile-edit-save');
const profileEditMessage = document.querySelector('#profile-edit-message');
const themeToggle = document.querySelector('#theme-toggle');
const themeToggleIcon = themeToggle.querySelector('.theme-toggle-icon');
const accentColorPicker = document.querySelector('#accent-color');
let toastTimer;
let currentProfileName = '';
let currentProfileInitials = 'V';
let currentProfilePhotoUrl = '';
let currentProfileFirstName = '';
let currentProfileLastName = '';
let currentProfileNickname = '';
let currentUser = null;
let registeredUsers = [];
let incomingFriendRequests = [];
let outgoingFriendRequests = [];
const friendRequestStates = new Map();
const profilePhotoInput = document.querySelector('#profile-photo-input');
const profilePhotoButton = document.querySelector('#profile-photo-button');
let selectedPublicProfile = null;
let socialChats = [];
let currentChatSettings = new Map();
let blockedUserIds = new Set();
let selectedChatId = '';
let showArchivedChats = false;
let stopWatchingChats;
let stopWatchingChatSettings;
let stopWatchingBlocks;
let stopWatchingMessages;
let stopWatchingUsers;
let stopWatchingIncomingRequests;
let stopWatchingOutgoingRequests;
let musicCatalogLoaded = false;
let emojiPickerLoadPromise;
let voiceRecorder;
let voiceRecorderStream;
let voiceRecordingChunks = [];
let voiceRecordingChatId = '';
let voiceRecordingCancelled = false;
let voiceRecordingTimeout;
let voiceRecordingTimer;
let voiceRecordingStartedAt = 0;

document.addEventListener('contextmenu', (event) => event.preventDefault());

function showView(viewName) {
  const target = panels.find((panel) => panel.dataset.panel === viewName);
  if (!target) return;

  panels.forEach((panel) => panel.classList.toggle('is-visible', panel === target));
  navItems.forEach((item) => {
    const isActive = item.dataset.view === viewName;
    item.classList.toggle('is-active', isActive);
    if (isActive) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });

  if (mobileView) mobileView.value = viewName;
  musicTransport.hidden = viewName !== 'music';
  if (viewName === 'music' && !musicCatalogLoaded) {
    searchYouTubeVideos('music', 'relevance');
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function appendTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function getFriendRequestId(firstUserId, secondUserId) {
  return `${firstUserId}_${secondUserId}`;
}

function areAcceptedFriends(firstUserId, secondUserId) {
  return friendRequestStates.get(getFriendRequestId(firstUserId, secondUserId))?.status === 'accepted'
    || friendRequestStates.get(getFriendRequestId(secondUserId, firstUserId))?.status === 'accepted';
}

function createFriendAction(profile, className = 'primary-button friend-action') {
  const requestId = getFriendRequestId(currentUser.uid, profile.id);
  const reverseRequestId = getFriendRequestId(profile.id, currentUser.uid);
  const outgoing = friendRequestStates.get(requestId);
  const incoming = friendRequestStates.get(reverseRequestId);
  const acceptedRequest = outgoing?.status === 'accepted' ? outgoing : incoming?.status === 'accepted' ? incoming : null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (blockedUserIds.has(profile.id)) {
    button.className = 'outline-button friend-action';
    button.textContent = 'Заблокирован';
    button.disabled = true;
  } else if (acceptedRequest) {
    button.className = 'outline-button friend-action friend-remove-action';
    button.textContent = 'Удалить из друзей';
    button.addEventListener('click', () => removeFriend(acceptedRequest, profile));
  } else if (incoming?.status === 'pending') {
    button.textContent = 'Принять заявку';
    button.addEventListener('click', () => respondToFriendRequest(incoming, 'accepted'));
  } else if (outgoing?.status === 'pending') {
    button.className = 'outline-button friend-action';
    button.textContent = 'Заявка отправлена';
    button.disabled = true;
  } else {
    button.textContent = 'Добавить в друзья';
    button.addEventListener('click', () => sendFriendRequest(profile.id));
  }
  return button;
}

function getAcceptedFriendIds() {
  const friendIds = new Set();
  [...incomingFriendRequests, ...outgoingFriendRequests].forEach((request) => {
    if (request.status !== 'accepted') return;
    friendIds.add(request.senderId === currentUser?.uid ? request.receiverId : request.senderId);
  });
  return [...friendIds].filter((id) => !blockedUserIds.has(id));
}

function getProfileById(userId) {
  return registeredUsers.find((profile) => profile.id === userId);
}

function getChatId(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join('_');
}

function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (timestamp instanceof Date) return timestamp.getTime();
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getCurrentChatSettings(chatId) {
  return currentChatSettings.get(chatId) || {
    muted: false,
    pinned: false,
    archived: false,
    hidden: false,
    hiddenLastMessageId: ''
  };
}

function renderChatList() {
  const searchTerm = chatSearch.value.trim().toLocaleLowerCase('ru');
  const visibleChats = socialChats
    .filter((chat) => {
      const settings = getCurrentChatSettings(chat.id);
      const otherUserId = chat.members.find((memberId) => memberId !== currentUser.uid);
      return showArchivedChats
        ? settings.archived && !settings.hidden && !blockedUserIds.has(otherUserId)
        : !settings.archived && !settings.hidden && !blockedUserIds.has(otherUserId);
    })
    .map((chat) => {
      const settings = getCurrentChatSettings(chat.id);
      const otherUserId = chat.members.find((memberId) => memberId !== currentUser.uid);
      const profile = getProfileById(otherUserId);
      const name = profile?.fullName || 'Пользователь';
      const preview = settings.hiddenLastMessageId === chat.lastMessageId
        ? 'Сообщение удалено у вас'
        : chat.lastMessage || '';
      const matchesSearch = `${name} ${profile?.nickname || ''} ${preview}`
        .toLocaleLowerCase('ru')
        .includes(searchTerm);
      return { chat, profile, name, preview, matchesSearch, settings };
    })
    .filter((entry) => entry.matchesSearch)
    .sort((first, second) => Number(second.settings.pinned) - Number(first.settings.pinned)
      || getTimestampValue(second.chat.lastMessageAt) - getTimestampValue(first.chat.lastMessageAt));

  chatItems.replaceChildren();
  visibleChats.forEach(({ chat, profile, name, preview, settings }) => {
    const row = document.createElement('div');
    row.className = 'chat-row';
    const button = document.createElement('button');
    button.className = `chat-person${chat.id === selectedChatId ? ' is-selected' : ''}`;
    button.type = 'button';
    const avatar = appendTextElement(button, 'span', 'avatar', profile?.initials || name[0] || 'V');
    if (profile?.avatarDataUrl) {
      const image = document.createElement('img');
      image.src = profile.avatarDataUrl;
      image.alt = '';
      avatar.replaceChildren(image);
    }
    const details = document.createElement('span');
    appendTextElement(details, 'strong', '', `${settings.pinned ? '📌 ' : ''}${settings.muted ? '🔕 ' : ''}${name}`);
    appendTextElement(details, 'small', '', preview || 'Начни переписку');
    button.append(details);
    if (chat.lastMessageAt) {
      const time = appendTextElement(button, 'time', '', new Date(getTimestampValue(chat.lastMessageAt)).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }));
      time.dateTime = new Date(getTimestampValue(chat.lastMessageAt)).toISOString();
    }
    button.addEventListener('click', () => selectChat(chat));
    row.append(button);

    const menuToggle = document.createElement('button');
    menuToggle.className = 'chat-more-button';
    menuToggle.type = 'button';
    menuToggle.textContent = '⋯';
    menuToggle.setAttribute('aria-label', `Действия чата с пользователем ${name}`);
    menuToggle.setAttribute('aria-haspopup', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'chat-context-menu';
    menu.hidden = true;
    menu.id = `chat-menu-${chat.id}`;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Действия чата: ${name}`);
    menuToggle.setAttribute('aria-controls', menu.id);
    const actions = [
      { key: 'pin', label: settings.pinned ? 'Открепить' : 'Закрепить' },
      { key: 'mute', label: settings.muted ? 'Включить звук' : 'Выключить звук' },
      { key: 'read', label: 'Отметить прочитанным' },
      { key: 'archive', label: settings.archived ? 'Вернуть из архива' : 'В архив' },
      { key: 'delete', label: 'Удалить чат', className: 'chat-context-delete' }
    ];
    actions.forEach(({ key, label, className = '' }) => {
      const actionButton = appendTextElement(menu, 'button', className, label);
      actionButton.type = 'button';
      actionButton.setAttribute('role', 'menuitem');
      actionButton.addEventListener('click', () => {
        closeChatMenus();
        handleChatMenuAction(chat.id, key);
      });
    });
    menuToggle.addEventListener('click', () => {
      const shouldOpen = menu.hidden;
      closeChatMenus();
      menu.hidden = !shouldOpen;
      menuToggle.setAttribute('aria-expanded', String(shouldOpen));
    });
    row.append(menuToggle, menu);
    chatItems.append(row);
  });

  if (!visibleChats.length) {
    appendTextElement(chatItems, 'div', 'empty-state', showArchivedChats
      ? 'В архиве пока нет чатов.'
      : 'Пока нет активных чатов.');
  }
  chatListTitle.textContent = showArchivedChats ? 'Архив' : 'Чаты';
  archiveToggle.textContent = showArchivedChats ? 'Чаты' : 'Архив';
  archiveToggle.setAttribute('aria-pressed', String(showArchivedChats));
}

function closeChatMenus() {
  chatItems.querySelectorAll('.chat-context-menu').forEach((menu) => {
    menu.hidden = true;
    menu.parentElement?.querySelector('.chat-more-button')?.setAttribute('aria-expanded', 'false');
  });
}

async function handleChatMenuAction(chatId, action) {
  const settings = getCurrentChatSettings(chatId);
  if (action === 'pin' || action === 'mute') {
    const key = action === 'pin' ? 'pinned' : 'muted';
    await saveChatSettings(chatId, { [key]: !settings[key] });
    return;
  }
  if (action === 'read') {
    if (await saveChatSettings(chatId, { lastReadAt: serverTimestamp() })) {
      showToast('Переписка отмечена прочитанной.');
    }
    return;
  }
  if (action === 'archive') {
    if (await saveChatSettings(chatId, { archived: !settings.archived })) {
      showToast(settings.archived ? 'Чат возвращён из архива.' : 'Чат добавлен в архив.');
    }
    return;
  }
  if (action === 'delete' && await saveChatSettings(chatId, { hidden: true })) {
    if (selectedChatId === chatId) {
      selectedChatId = '';
      messenger.classList.remove('has-selected-chat');
      stopWatchingMessages?.();
      conversationContent.hidden = true;
      conversationPlaceholder.hidden = false;
      chatMessages.replaceChildren();
    }
    showToast('Чат удалён из твоего списка.');
  }
}

function renderChatMessages(messages) {
  chatMessages.replaceChildren();
  const visibleMessages = messages.filter((message) => !message.deletedFor?.includes(currentUser.uid));
  if (!visibleMessages.length) {
    appendTextElement(chatMessages, 'div', 'messages-empty', 'Сообщений пока нет. Напиши первым!');
    return;
  }
  visibleMessages.forEach((message) => {
    const bubble = appendTextElement(chatMessages, 'article',
      `bubble${message.senderId === currentUser.uid ? ' bubble--outgoing' : ' bubble--incoming'}`,
      '');
    if (message.audioData && !message.deleted) {
      bubble.append(createVoiceMessagePlayer(message.audioData));
    } else {
      appendTextElement(bubble, 'span', 'bubble-text', message.deleted ? 'Сообщение удалено' : message.text);
    }
    if (message.createdAt) {
      const time = appendTextElement(bubble, 'time', '', new Date(getTimestampValue(message.createdAt)).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }));
      time.dateTime = new Date(getTimestampValue(message.createdAt)).toISOString();
    }
    if (!message.deleted) {
      const chatId = selectedChatId;
      const actions = appendTextElement(bubble, 'details', 'message-actions', '');
      const summary = appendTextElement(actions, 'summary', '', '⋯');
      summary.setAttribute('aria-label', 'Действия с сообщением');
      const hideButton = appendTextElement(actions, 'button', '', 'Удалить у меня');
      hideButton.type = 'button';
      hideButton.addEventListener('click', () => deleteChatMessage(message, 'self', chatId));
      if (message.senderId === currentUser.uid) {
        const deleteButton = appendTextElement(actions, 'button', 'chat-context-delete', 'Удалить у всех');
        deleteButton.type = 'button';
        deleteButton.addEventListener('click', () => deleteChatMessage(message, 'everyone', chatId));
      }
    }
    chatMessages.append(bubble);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function createVoiceMessagePlayer(audioData) {
  const player = document.createElement('div');
  player.className = 'voice-player';
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = audioData;
  audio.setAttribute('aria-label', 'Голосовое сообщение');
  audio.hidden = true;

  const playButton = appendTextElement(player, 'button', 'voice-player-toggle', '▶');
  playButton.type = 'button';
  playButton.setAttribute('aria-label', 'Воспроизвести голосовое сообщение');
  const controls = document.createElement('div');
  controls.className = 'voice-player-controls';
  const progress = document.createElement('input');
  progress.className = 'voice-player-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1000';
  progress.value = '0';
  progress.setAttribute('aria-label', 'Позиция голосового сообщения');
  const time = appendTextElement(controls, 'span', 'voice-player-time', '0:00 / 0:00');
  controls.prepend(progress);
  player.append(controls, audio);

  const updateProgress = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const fraction = duration ? audio.currentTime / duration : 0;
    progress.value = String(Math.round(fraction * 1000));
    progress.style.setProperty('--voice-progress', `${fraction * 100}%`);
    time.textContent = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(duration)}`;
  };
  const updatePlayButton = (isPlaying) => {
    playButton.textContent = isPlaying ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', isPlaying
      ? 'Приостановить голосовое сообщение'
      : 'Воспроизвести голосовое сообщение');
    player.classList.toggle('is-playing', isPlaying);
  };

  playButton.addEventListener('click', async () => {
    if (audio.paused) {
      document.querySelectorAll('.voice-player audio').forEach((otherAudio) => {
        if (otherAudio !== audio) otherAudio.pause();
      });
      try {
        await audio.play();
      } catch (error) {
        console.error('Не удалось воспроизвести голосовое сообщение:', error);
        showToast('Не удалось воспроизвести голосовое сообщение.');
      }
    } else {
      audio.pause();
    }
  });
  progress.addEventListener('input', () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = audio.duration * Number(progress.value) / 1000;
    updateProgress();
  });
  audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('play', () => updatePlayButton(true));
  audio.addEventListener('pause', () => updatePlayButton(false));
  audio.addEventListener('ended', () => {
    updatePlayButton(false);
    updateProgress();
  });
  updateProgress();
  return player;
}

function setChatComposerEnabled(enabled) {
  chatMessageInput.disabled = !enabled;
  chatMessageForm.querySelectorAll('button').forEach((button) => {
    button.disabled = !enabled;
  });
  if (voiceRecorder?.state === 'recording') {
    voiceStopButton.disabled = false;
  }
}

async function deleteChatMessage(message, scope, chatId) {
  const messageReference = doc(db, 'chats', chatId, 'messages', message.id);
  try {
    if (scope === 'self') {
      const deletedFor = [...new Set([...(message.deletedFor || []), currentUser.uid])];
      await updateDoc(messageReference, { deletedFor });
      const chat = socialChats.find((entry) => entry.id === chatId);
      if (chat?.lastMessageId === message.id) {
        await saveChatSettings(chat.id, { hiddenLastMessageId: message.id });
      }
      showToast('Сообщение удалено из твоего чата.');
      return;
    }

    const chat = socialChats.find((entry) => entry.id === chatId);
    if (!chat || message.senderId !== currentUser.uid) return;
    await deleteDoc(messageReference);
    if (chat.lastMessageId === message.id) {
      try {
        await updateDoc(doc(db, 'chats', chat.id), { lastMessage: 'Сообщение удалено' });
      } catch (error) {
        console.error('Сообщение удалено, но не удалось обновить превью чата:', error);
      }
    }
    if (getCurrentChatSettings(chat.id).hiddenLastMessageId === message.id) {
      await saveChatSettings(chat.id, { hiddenLastMessageId: '' });
    }
    showToast('Сообщение удалено у всех участников.');
  } catch (error) {
    console.error(`Не удалось удалить сообщение (${scope}) в чате ${chatId}:`, error?.code, error?.message, error);
    if (error?.code === 'permission-denied') {
      showToast(scope === 'everyone'
        ? 'Firestore запретил удаление документа сообщения. Опубликуй правила, разрешающие автору удалять своё сообщение.'
        : 'Firestore отклонил удаление сообщения. Проверь опубликованные правила Firestore.');
      return;
    }
    showToast(`Не удалось удалить сообщение (${error?.code || 'ошибка'}). Проверь подключение и попробуй снова.`);
  }
}

async function saveChatSettings(chatId, changes) {
  if (!currentUser || !db) return false;
  const settings = { ...getCurrentChatSettings(chatId), ...changes, updatedAt: serverTimestamp() };
  try {
    await setDoc(doc(db, 'chatSettings', currentUser.uid, 'chats', chatId), settings, { merge: true });
    currentChatSettings.set(chatId, settings);
    renderChatList();
    return true;
  } catch (error) {
    showToast(error?.code === 'permission-denied'
      ? 'Не удалось изменить чат. Проверь правила Firestore.'
      : 'Не удалось изменить чат. Проверь подключение и попробуй снова.');
    return false;
  }
}

async function openChatWithProfile(profile) {
  if (!currentUser || blockedUserIds.has(profile.id)) {
    showToast('Сначала разблокируй пользователя, чтобы открыть переписку.');
    return;
  }
  if (!areAcceptedFriends(currentUser.uid, profile.id)) {
    showToast('Начать переписку можно только с пользователем из друзей.');
    return;
  }

  const chatId = getChatId(currentUser.uid, profile.id);
  let operation = 'проверить';
  try {
    const chatReference = doc(db, 'chats', chatId);
    const chatSnapshot = await getDoc(chatReference);
    let chat = { id: chatId, members: [currentUser.uid, profile.id] };
    if (!chatSnapshot.exists()) {
      operation = 'создать';
      await setDoc(chatReference, {
        members: [currentUser.uid, profile.id].sort(),
        createdAt: serverTimestamp()
      });
    } else {
      chat = { id: chatId, ...chatSnapshot.data() };
    }
    const currentSettings = getCurrentChatSettings(chatId);
    if (currentSettings.hidden || currentSettings.archived) {
      operation = 'обновить настройки';
      await saveChatSettings(chatId, { hidden: false, archived: false });
    }
    socialChats = [...socialChats.filter((entry) => entry.id !== chatId), chat];
    selectChat(chat);
  } catch (error) {
    console.error(`Не удалось ${operation} переписку:`, error);
    showToast(error?.code === 'permission-denied'
      ? `Firestore запретил ${operation} переписки. Проверь, что заявка в друзья принята и последние правила опубликованы.`
      : `Не удалось ${operation} переписку (${error?.code || 'ошибка'}). Проверь подключение.`);
  }
}

function selectChat(chat) {
  const chatChanged = selectedChatId !== chat.id;
  selectedChatId = chat.id;
  messenger.classList.add('has-selected-chat');
  chatEmojiPicker.hidden = true;
  chatEmojiToggle.setAttribute('aria-expanded', 'false');
  showView('messages');
  conversationPlaceholder.hidden = true;
  conversationContent.hidden = false;
  const otherUserId = chat.members.find((memberId) => memberId !== currentUser.uid);
  const profile = getProfileById(otherUserId);
  const name = profile?.fullName || 'Пользователь';
  const avatar = document.querySelector('#chat-header-avatar');
  avatar.textContent = profile?.initials || name[0] || 'V';
  if (profile?.avatarDataUrl) {
    const image = document.createElement('img');
    image.src = profile.avatarDataUrl;
    image.alt = '';
    avatar.replaceChildren(image);
  }
  document.querySelector('#chat-header-name').textContent = name;
  document.querySelector('#chat-header-nickname').textContent = profile ? `@${profile.nickname}` : '';
  const canMessage = areAcceptedFriends(currentUser.uid, otherUserId) && !blockedUserIds.has(otherUserId);
  setChatComposerEnabled(canMessage);
  chatMessageInput.placeholder = blockedUserIds.has(otherUserId)
    ? 'Разблокируй пользователя, чтобы отправить сообщение'
    : canMessage ? 'Напиши сообщение…' : 'Добавь пользователя в друзья, чтобы отправить сообщение';
  if (chatChanged) {
    stopWatchingMessages?.();
    stopWatchingMessages = onSnapshot(
      query(collection(db, 'chats', chat.id, 'messages'), orderBy('createdAt', 'asc')),
      (snapshot) => {
        renderChatMessages(snapshot.docs.map((messageDocument) => ({
          id: messageDocument.id,
          ...messageDocument.data()
        })));
      },
      (error) => {
        console.error(`Не удалось загрузить сообщения чата ${chat.id}:`, error);
        showToast(`Не удалось загрузить сообщения (${error?.code || 'ошибка'}). Проверь права участника чата.`);
      }
    );
  }
  renderChatList();
}

async function sendChatMessage(event) {
  event.preventDefault();
  const text = chatMessageInput.value.trim();
  if (!text) return;
  await sendChatPayload(text, '', selectedChatId);
}

async function sendChatPayload(text, audioData, chatId) {
  const chat = socialChats.find((entry) => entry.id === chatId);
  if ((!text && !audioData) || !chat || !currentUser) return;
  const receiverId = chat.members.find((memberId) => memberId !== currentUser.uid);
  if (blockedUserIds.has(receiverId) || !areAcceptedFriends(currentUser.uid, receiverId)) {
    showToast(blockedUserIds.has(receiverId)
      ? 'Разблокируй пользователя, чтобы отправить сообщение.'
      : 'Добавь пользователя в друзья, чтобы отправить сообщение.');
    return;
  }
  if (audioData.length > 650000) {
    showToast('Запись слишком большая. Попробуй записать короче.');
    return;
  }

  setChatComposerEnabled(false);
  try {
    const batch = writeBatch(db);
    const messageReference = doc(collection(db, 'chats', chat.id, 'messages'));
    const message = {
      senderId: currentUser.uid,
      text,
      createdAt: serverTimestamp()
    };
    if (audioData) {
      message.text = '[Голосовое сообщение]';
      message.audioData = audioData;
      message.audioType = audioData.slice(5, audioData.indexOf(';'));
    }
    batch.set(messageReference, message);
    batch.update(doc(db, 'chats', chat.id), {
      lastMessage: message.text,
      lastMessageAt: serverTimestamp(),
      lastMessageSender: currentUser.uid,
      lastMessageId: messageReference.id
    });
    batch.set(doc(db, 'chatSettings', currentUser.uid, 'chats', chat.id), {
      ...getCurrentChatSettings(chat.id),
      hidden: false,
      hiddenLastMessageId: '',
      lastReadAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await batch.commit();
    if (selectedChatId === chat.id && !audioData) chatMessageInput.value = '';
  } catch (error) {
    console.error('Не удалось отправить сообщение:', error);
    showToast(error?.code === 'permission-denied'
      ? 'Не удалось отправить сообщение. Проверь опубликованные правила Firestore и статус дружбы.'
      : 'Не удалось отправить сообщение. Проверь подключение и попробуй снова.');
  } finally {
    const activeChat = socialChats.find((entry) => entry.id === selectedChatId);
    const otherUserId = activeChat?.members.find((memberId) => memberId !== currentUser?.uid);
    setChatComposerEnabled(Boolean(activeChat && currentUser
      && areAcceptedFriends(currentUser.uid, otherUserId)
      && !blockedUserIds.has(otherUserId)));
    if (selectedChatId === chat.id && !audioData) chatMessageInput.focus();
  }
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать голосовую запись.'));
    reader.readAsDataURL(blob);
  });
}

function setVoiceRecordingControls(isRecording) {
  voiceRecordButton.hidden = isRecording;
  voiceStopButton.hidden = !isRecording;
  voiceRecordingStatus.hidden = !isRecording;
  if (isRecording) {
    voiceRecordingStatus.textContent = `Запись ${formatVoiceRecordingDuration(0)} / 00:30`;
    voiceRecordingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - voiceRecordingStartedAt) / 1000);
      voiceRecordingStatus.textContent = `Запись ${formatVoiceRecordingDuration(elapsed)} / 00:30`;
    }, 250);
  } else {
    clearInterval(voiceRecordingTimer);
    voiceRecordingTimer = null;
  }
}

function formatVoiceRecordingDuration(totalSeconds) {
  const seconds = Math.min(totalSeconds, 30);
  return `00:${String(seconds).padStart(2, '0')}`;
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast('Запись голосовых сообщений не поддерживается этим браузером.');
    return;
  }
  const chat = socialChats.find((entry) => entry.id === selectedChatId);
  if (!chat || !currentUser) return;
  const receiverId = chat.members.find((memberId) => memberId !== currentUser.uid);
  if (blockedUserIds.has(receiverId) || !areAcceptedFriends(currentUser.uid, receiverId)) {
    showToast('Отправлять голосовые сообщения можно только друзьям, которым разрешено писать.');
    return;
  }

  try {
    voiceRecorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
      ? ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type))
      : '';
    voiceRecorder = new MediaRecorder(voiceRecorderStream, mimeType ? { mimeType } : undefined);
    voiceRecordingChunks = [];
    voiceRecordingCancelled = false;
    voiceRecordingChatId = chat.id;
    voiceRecordingStartedAt = Date.now();
    voiceRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) voiceRecordingChunks.push(event.data);
    });
    voiceRecorder.addEventListener('error', (event) => {
      console.error('Ошибка записи голосового сообщения:', event.error);
      voiceRecordingCancelled = true;
      showToast('Не удалось записать голосовое сообщение.');
      if (voiceRecorder?.state === 'recording') stopVoiceRecording(true);
    });
    voiceRecorder.addEventListener('stop', async () => {
      clearTimeout(voiceRecordingTimeout);
      clearInterval(voiceRecordingTimer);
      voiceRecordingTimer = null;
      voiceRecorderStream?.getTracks().forEach((track) => track.stop());
      voiceRecorderStream = null;
      const recording = new Blob(voiceRecordingChunks, { type: voiceRecorder?.mimeType || mimeType || 'audio/webm' });
      const cancelled = voiceRecordingCancelled;
      const chatId = voiceRecordingChatId;
      voiceRecorder = null;
      voiceRecordingChunks = [];
      voiceRecordingChatId = '';
      setVoiceRecordingControls(false);
      const activeChat = socialChats.find((entry) => entry.id === selectedChatId);
      const otherUserId = activeChat?.members.find((memberId) => memberId !== currentUser?.uid);
      setChatComposerEnabled(Boolean(activeChat && currentUser
        && areAcceptedFriends(currentUser.uid, otherUserId)
        && !blockedUserIds.has(otherUserId)));
      if (cancelled) return;
      if (!recording.size) {
        showToast('Запись пустая. Попробуй ещё раз.');
        return;
      }
      if (recording.size > 450000) {
        showToast('Запись слишком большая. Попробуй записать короче.');
        return;
      }
      voiceRecordingStatus.hidden = false;
      voiceRecordingStatus.textContent = 'Подготовка голосового сообщения…';
      try {
        const dataUrl = await readBlobAsDataUrl(recording);
        const base64 = String(dataUrl).split(',')[1];
        const audioType = recording.type.split(';')[0];
        if (!base64 || !['audio/webm', 'audio/ogg', 'audio/mp4'].includes(audioType)) {
          throw new Error('Формат голосовой записи не поддерживается.');
        }
        await sendChatPayload('', `data:${audioType};base64,${base64}`, chatId);
      } catch (error) {
        console.error('Не удалось подготовить голосовое сообщение:', error);
        showToast(error.message || 'Не удалось подготовить голосовое сообщение.');
      } finally {
        voiceRecordingStatus.hidden = true;
      }
    }, { once: true });
    voiceRecorder.start(1000);
    setVoiceRecordingControls(true);
    setChatComposerEnabled(false);
    voiceRecordingTimeout = setTimeout(() => stopVoiceRecording(false), 30000);
  } catch (error) {
    console.error('Не удалось начать запись голоса:', error);
    clearTimeout(voiceRecordingTimeout);
    clearInterval(voiceRecordingTimer);
    voiceRecordingTimer = null;
    voiceRecorderStream?.getTracks().forEach((track) => track.stop());
    voiceRecorderStream = null;
    voiceRecorder = null;
    showToast(error.name === 'NotAllowedError'
      ? 'Разреши доступ к микрофону, чтобы записать сообщение.'
      : 'Не удалось начать запись голосового сообщения.');
  }
}

function stopVoiceRecording(cancelled) {
  if (voiceRecorder?.state !== 'recording') return;
  voiceRecordingCancelled = cancelled;
  clearTimeout(voiceRecordingTimeout);
  voiceRecorder.stop();
}

async function toggleEmojiPicker() {
  if (!chatEmojiPicker.hidden) {
    chatEmojiPicker.hidden = true;
    chatEmojiToggle.setAttribute('aria-expanded', 'false');
    return;
  }
  try {
    if (!customElements.get('emoji-picker')) {
      emojiPickerLoadPromise ||= import('https://cdn.jsdelivr.net/npm/emoji-picker-element@1.29.1/index.js');
      await emojiPickerLoadPromise;
    }
    if (!chatEmojiPicker.firstChild) {
      const picker = document.createElement('emoji-picker');
      picker.setAttribute('locale', 'ru');
      picker.classList.toggle('dark', document.documentElement.dataset.theme === 'dark');
      picker.addEventListener('emoji-click', (event) => {
        const emoji = event.detail?.unicode;
        if (typeof emoji !== 'string' || !emoji) return;
        const replacedLength = chatMessageInput.selectionEnd - chatMessageInput.selectionStart;
        if (chatMessageInput.value.length - replacedLength + emoji.length > chatMessageInput.maxLength) {
          showToast('Достигнут лимит длины сообщения.');
          return;
        }
        chatMessageInput.setRangeText(emoji, chatMessageInput.selectionStart, chatMessageInput.selectionEnd, 'end');
        chatMessageInput.dispatchEvent(new Event('input', { bubbles: true }));
        chatMessageInput.focus();
      });
      chatEmojiPicker.append(picker);
    }
    chatEmojiPicker.hidden = false;
    chatEmojiToggle.setAttribute('aria-expanded', 'true');
  } catch (error) {
    console.error('Не удалось загрузить панель эмодзи:', error);
    emojiPickerLoadPromise = null;
    showToast('Не удалось загрузить эмодзи. Проверь подключение к интернету.');
  }
}

function updateFriendshipCounts() {
  const friendIds = new Set();
  [...incomingFriendRequests, ...outgoingFriendRequests].forEach((request) => {
    if (request.status !== 'accepted') return;
    friendIds.add(request.senderId === currentUser?.uid ? request.receiverId : request.senderId);
  });
  const count = String(friendIds.size);
  document.querySelector('#profile-friend-count').textContent = count;
}

function renderFriendUsers() {
  registeredUsersCount.textContent = String(registeredUsers.length);
  registeredUsersList.replaceChildren();
  if (!registeredUsers.length) {
    const empty = appendTextElement(registeredUsersList, 'div', 'card empty-state friends-empty',
      'Пока нет других пользователей. Когда кто-нибудь зарегистрируется, он появится здесь.');
    return empty;
  }

  registeredUsers.forEach((profile) => {
    const card = document.createElement('article');
    card.className = 'card person-card';
    const avatar = appendTextElement(card, 'span', 'avatar avatar--person', profile.initials);
    avatar.setAttribute('aria-label', `Фото профиля: ${profile.fullName}`);
    if (profile.avatarDataUrl) {
      const image = document.createElement('img');
      image.src = profile.avatarDataUrl;
      image.alt = '';
      avatar.replaceChildren(image);
    }
    const profileLink = appendTextElement(card, 'button', 'person-profile-link', profile.fullName);
    profileLink.type = 'button';
    profileLink.addEventListener('click', () => openPublicProfile(profile));
    appendTextElement(card, 'small', '', `@${profile.nickname}`);

    card.append(createFriendAction(profile));
    registeredUsersList.append(card);
  });
}

function openPublicProfile(profile) {
  selectedPublicProfile = profile;
  renderPublicProfile(profile);
  showView('user-profile');
}

function renderPublicProfile(profile) {
  document.querySelector('#public-profile-name').textContent = profile.fullName;
  document.querySelector('#public-profile-nickname').textContent = `@${profile.nickname}`;
  const avatar = document.querySelector('#public-profile-avatar');
  avatar.textContent = profile.initials;
  avatar.setAttribute('aria-label', `Фото профиля: ${profile.fullName}`);
  if (profile.avatarDataUrl) {
    const image = document.createElement('img');
    image.src = profile.avatarDataUrl;
    image.alt = `Фото профиля: ${profile.fullName}`;
    avatar.replaceChildren(image);
  }
  renderPublicProfileFriendAction(profile);
  profileBlockButton.textContent = blockedUserIds.has(profile.id) ? 'Разблокировать' : 'Заблокировать';
  profileBlockButton.setAttribute('aria-pressed', String(blockedUserIds.has(profile.id)));
  const alreadyFriends = areAcceptedFriends(currentUser.uid, profile.id);
  profileMessageButton.disabled = !alreadyFriends || blockedUserIds.has(profile.id);
  profileMessageButton.title = alreadyFriends ? '' : 'Добавь пользователя в друзья, чтобы написать ему';
  if (blockedUserIds.has(profile.id)) profileMessageButton.title = 'Разблокируй пользователя, чтобы написать ему';
}

function renderPublicProfileFriendAction(profile) {
  const oldAction = document.querySelector('#public-profile-friend-action');
  const action = createFriendAction(profile, 'primary-button');
  action.id = oldAction.id;
  oldAction.replaceWith(action);
}

function refreshPublicProfileFriendAction() {
  const profilePanel = panels.find((panel) => panel.dataset.panel === 'user-profile');
  if (!selectedPublicProfile || !profilePanel?.classList.contains('is-visible')) return;
  renderPublicProfile(selectedPublicProfile);
}

function renderNotifications() {
  const unseenIncoming = incomingFriendRequests.filter((request) => request.status === 'pending' && !request.receiverSeen);
  const unseenResponses = outgoingFriendRequests.filter((request) => request.status !== 'pending' && !request.senderSeen);
  const unreadCount = unseenIncoming.length + unseenResponses.length;
  notificationCount.textContent = String(unreadCount);
  notificationCount.hidden = unreadCount === 0;
  notificationList.replaceChildren();

  const pendingRequests = incomingFriendRequests.filter((request) => request.status === 'pending');
  const responses = outgoingFriendRequests.filter((request) => request.status === 'accepted' || request.status === 'declined');
  if (!pendingRequests.length && !responses.length) {
    appendTextElement(notificationList, 'div', 'empty-state', 'Пока нет уведомлений.');
    return;
  }

  pendingRequests.forEach((request) => {
    const requester = registeredUsers.find((profile) => profile.id === request.senderId);
    const name = requester?.fullName || 'Пользователь';
    const item = document.createElement('article');
    item.className = 'notification-item';
    appendTextElement(item, 'p', '', `${name} хочет добавить вас в друзья.`);
    appendTextElement(item, 'small', '', requester ? `@${requester.nickname}` : 'Заявка в друзья');
    const actions = appendTextElement(item, 'div', 'notification-actions', '');
    const accept = appendTextElement(actions, 'button', 'notification-accept', 'Принять');
    accept.addEventListener('click', () => respondToFriendRequest(request, 'accepted'));
    const decline = appendTextElement(actions, 'button', '', 'Отклонить');
    decline.addEventListener('click', () => respondToFriendRequest(request, 'declined'));
    notificationList.append(item);
  });

  responses.forEach((request) => {
    const profile = registeredUsers.find((user) => user.id === request.receiverId);
    const name = profile?.fullName || 'Пользователь';
    const message = request.status === 'accepted'
      ? `${name} принял(а) вашу заявку в друзья.`
      : `${name} отклонил(а) вашу заявку в друзья.`;
    const item = document.createElement('article');
    item.className = 'notification-item';
    appendTextElement(item, 'p', '', message);
    appendTextElement(item, 'small', '', `@${profile?.nickname || 'пользователь'}`);
    notificationList.append(item);
  });
}

async function sendFriendRequest(receiverId) {
  if (!currentUser || !db || receiverId === currentUser.uid) return;
  const requestId = getFriendRequestId(currentUser.uid, receiverId);
  const existingRequest = friendRequestStates.get(requestId);
  if (existingRequest?.status === 'pending' || existingRequest?.status === 'accepted') return;

  try {
    await setDoc(doc(db, 'friendRequests', requestId), {
      senderId: currentUser.uid,
      receiverId,
      status: 'pending',
      createdAt: serverTimestamp(),
      senderSeen: true,
      receiverSeen: false
    }, { merge: true });
    showToast('Заявка в друзья отправлена.');
  } catch (error) {
    showToast(error?.code === 'permission-denied'
      ? 'Не удалось отправить заявку. Проверь правила Firestore.'
      : 'Не удалось отправить заявку. Проверь соединение и попробуй снова.');
  }
}

async function removeFriend(request, profile) {
  if (!currentUser || request.status !== 'accepted') return;
  if (!window.confirm(`Удалить пользователя ${profile.fullName} из друзей?`)) return;

  try {
    await deleteDoc(doc(db, 'friendRequests', request.id));
    friendRequestStates.delete(request.id);
    incomingFriendRequests = incomingFriendRequests.filter((entry) => entry.id !== request.id);
    outgoingFriendRequests = outgoingFriendRequests.filter((entry) => entry.id !== request.id);
    renderFriendUsers();
    renderNotifications();
    updateFriendshipCounts();
    renderChatList();
    if (selectedChatId === getChatId(currentUser.uid, profile.id)) {
      const chat = socialChats.find((entry) => entry.id === selectedChatId);
      if (chat) selectChat(chat);
    }
    showToast(`${profile.fullName} удалён(а) из друзей.`);
  } catch (error) {
    console.error('Не удалось удалить пользователя из друзей:', error);
    showToast(error?.code === 'permission-denied'
      ? 'Не удалось удалить из друзей. Проверь правила Firestore.'
      : 'Не удалось удалить из друзей. Проверь подключение и попробуй снова.');
  }
}

async function respondToFriendRequest(request, status) {
  if (!currentUser || currentUser.uid !== request.receiverId || !['accepted', 'declined'].includes(status)) return;
  try {
    await updateDoc(doc(db, 'friendRequests', request.id), {
      status,
      receiverSeen: true,
      senderSeen: false,
      respondedAt: serverTimestamp()
    });
    showToast(status === 'accepted' ? 'Заявка принята.' : 'Заявка отклонена.');
  } catch (error) {
    showToast(error?.code === 'permission-denied'
      ? 'Не удалось ответить на заявку. Проверь правила Firestore.'
      : 'Не удалось ответить на заявку. Попробуй ещё раз.');
  }
}

async function markNotificationsAsSeen() {
  if (!currentUser || !db) return;
  const unread = [
    ...incomingFriendRequests.filter((request) => request.status === 'pending' && !request.receiverSeen)
      .map((request) => updateDoc(doc(db, 'friendRequests', request.id), { receiverSeen: true })),
    ...outgoingFriendRequests.filter((request) => request.status !== 'pending' && !request.senderSeen)
      .map((request) => updateDoc(doc(db, 'friendRequests', request.id), { senderSeen: true }))
  ];
  if (!unread.length) return;
  try {
    await Promise.all(unread);
  } catch {
    showToast('Не удалось отметить уведомления прочитанными. Проверь подключение.');
  }
}

function watchSocialData(user) {
  stopWatchingUsers?.();
  stopWatchingIncomingRequests?.();
  stopWatchingOutgoingRequests?.();
  stopWatchingChats?.();
  stopWatchingChatSettings?.();
  stopWatchingBlocks?.();
  stopWatchingMessages?.();
  registeredUsers = [];
  incomingFriendRequests = [];
  outgoingFriendRequests = [];
  socialChats = [];
  currentChatSettings.clear();
  blockedUserIds.clear();
  selectedChatId = '';
  messenger.classList.remove('has-selected-chat');
  conversationPlaceholder.hidden = false;
  conversationContent.hidden = true;
  friendRequestStates.clear();
  registeredUsersList.replaceChildren();
  friendsStatus.textContent = 'Загружаем пользователей…';

  stopWatchingUsers = onSnapshot(collection(db, 'publicProfiles'), (snapshot) => {
    registeredUsers = snapshot.docs
      .filter((profileDocument) => profileDocument.id !== user.uid)
      .map((profileDocument) => {
        const profile = profileDocument.data();
        const fullName = `${profile.firstName} ${profile.lastName}`.trim() || `@${profile.nickname}`;
        const initials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('ru');
        return {
          id: profileDocument.id,
          firstName: typeof profile.firstName === 'string' ? profile.firstName : '',
          lastName: typeof profile.lastName === 'string' ? profile.lastName : '',
          fullName,
          initials: initials || 'V',
          nickname: typeof profile.nickname === 'string' ? profile.nickname : 'профиль',
          avatarDataUrl: typeof profile.avatarDataUrl === 'string' ? profile.avatarDataUrl : ''
        };
      })
      .sort((first, second) => first.fullName.localeCompare(second.fullName, 'ru'));
    friendsStatus.textContent = registeredUsers.length ? 'Добавляй знакомых в друзья.' : '';
    if (selectedPublicProfile) {
      const updatedProfile = registeredUsers.find((profile) => profile.id === selectedPublicProfile.id);
      if (updatedProfile) {
        selectedPublicProfile = updatedProfile;
        const profilePanel = panels.find((panel) => panel.dataset.panel === 'user-profile');
        if (profilePanel?.classList.contains('is-visible')) renderPublicProfile(updatedProfile);
      }
    }
    renderFriendUsers();
    renderNotifications();
    renderChatList();
    refreshPublicProfileFriendAction();
  }, () => {
    friendsStatus.textContent = 'Не удалось загрузить пользователей. Проверь правила Firestore.';
  });

  stopWatchingIncomingRequests = onSnapshot(
    query(collection(db, 'friendRequests'), where('receiverId', '==', user.uid)),
    (snapshot) => {
      incomingFriendRequests = snapshot.docs.map((requestDocument) => ({
        id: requestDocument.id,
        ...requestDocument.data()
      }));
      incomingFriendRequests.forEach((request) => friendRequestStates.set(request.id, request));
      renderFriendUsers();
      renderNotifications();
      updateFriendshipCounts();
      refreshPublicProfileFriendAction();
      renderChatList();
    },
    () => showToast('Не удалось загрузить заявки в друзья. Проверь правила Firestore.')
  );

  stopWatchingOutgoingRequests = onSnapshot(
    query(collection(db, 'friendRequests'), where('senderId', '==', user.uid)),
    (snapshot) => {
      outgoingFriendRequests = snapshot.docs.map((requestDocument) => ({
        id: requestDocument.id,
        ...requestDocument.data()
      }));
      outgoingFriendRequests.forEach((request) => friendRequestStates.set(request.id, request));
      renderFriendUsers();
      renderNotifications();
      updateFriendshipCounts();
      refreshPublicProfileFriendAction();
      renderChatList();
    },
    () => showToast('Не удалось загрузить ваши заявки в друзья. Проверь правила Firestore.')
  );

  stopWatchingChats = onSnapshot(
    query(collection(db, 'chats'), where('members', 'array-contains', user.uid)),
    (snapshot) => {
      socialChats = snapshot.docs.map((chatDocument) => ({
        id: chatDocument.id,
        ...chatDocument.data()
      }));
      renderChatList();
      if (selectedChatId) {
        const updatedChat = socialChats.find((chat) => chat.id === selectedChatId);
        if (updatedChat) selectChat(updatedChat);
        else {
          selectedChatId = '';
          messenger.classList.remove('has-selected-chat');
          stopWatchingMessages?.();
          conversationContent.hidden = true;
          conversationPlaceholder.hidden = false;
        }
      }
    },
    () => showToast('Не удалось загрузить чаты. Проверь правила Firestore.')
  );

  stopWatchingChatSettings = onSnapshot(
    collection(db, 'chatSettings', user.uid, 'chats'),
    (snapshot) => {
      currentChatSettings = new Map(snapshot.docs.map((settingsDocument) => [
        settingsDocument.id,
        settingsDocument.data()
      ]));
      renderChatList();
    },
    (error) => {
      console.error('Не удалось загрузить настройки чатов:', error);
      showToast(`Не удалось загрузить настройки чатов (${error?.code || 'ошибка'}).`);
    }
  );

  stopWatchingBlocks = onSnapshot(
    collection(db, 'users', user.uid, 'blocks'),
    (snapshot) => {
      blockedUserIds = new Set(snapshot.docs.map((blockDocument) => blockDocument.id));
      renderFriendUsers();
      refreshPublicProfileFriendAction();
      renderChatList();
      if (selectedChatId) {
        const chat = socialChats.find((entry) => entry.id === selectedChatId);
        if (chat) selectChat(chat);
      }
    },
    () => showToast('Не удалось загрузить список заблокированных пользователей. Проверь правила Firestore.')
  );
}

function renderProfilePhoto(photoUrl) {
  currentProfilePhotoUrl = photoUrl;
  document.querySelectorAll('[data-user-avatar]').forEach((element) => {
    if (photoUrl) {
      const image = document.createElement('img');
      image.src = photoUrl;
      image.alt = `Фото профиля: ${currentProfileName}`;
      element.replaceChildren(image);
    } else {
      element.textContent = currentProfileInitials;
    }
    element.setAttribute('aria-label', `Профиль: ${currentProfileName}`);
  });

  const profileAvatar = document.querySelector('[data-profile-avatar]');
  if (profileAvatar) {
    if (photoUrl) {
      const image = document.createElement('img');
      image.src = photoUrl;
      image.alt = `Фото профиля: ${currentProfileName}`;
      profileAvatar.replaceChildren(image);
    } else {
      profileAvatar.textContent = currentProfileInitials;
    }
  }

}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  chatEmojiPicker.querySelector('emoji-picker')?.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('vkt-theme', theme);
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const actionLabel = `Включить ${nextTheme === 'dark' ? 'тёмную' : 'светлую'} тему`;
  themeToggle.setAttribute('aria-label', actionLabel);
  themeToggle.title = actionLabel;
  themeToggleIcon.textContent = nextTheme === 'dark' ? '☾' : '☀';
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
}

function setAccentColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  const channels = color.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const lightness = (max + min) / 2;
  let saturation = 0;
  let hue = 0;

  if (max !== min) {
    const delta = max - min;
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === channels[0]) hue = ((channels[1] - channels[2]) / delta) % 6;
    else if (max === channels[1]) hue = (channels[2] - channels[0]) / delta + 2;
    else hue = (channels[0] - channels[1]) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const tonedSaturation = Math.min(saturation, 0.48);
  const tonedLightness = Math.min(0.53, Math.max(0.4, lightness));
  const chroma = (1 - Math.abs(2 * tonedLightness - 1)) * tonedSaturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  let rgb;

  if (hueSection < 1) rgb = [chroma, secondary, 0];
  else if (hueSection < 2) rgb = [secondary, chroma, 0];
  else if (hueSection < 3) rgb = [0, chroma, secondary];
  else if (hueSection < 4) rgb = [0, secondary, chroma];
  else if (hueSection < 5) rgb = [secondary, 0, chroma];
  else rgb = [chroma, 0, secondary];

  const offset = tonedLightness - chroma / 2;
  const tonedColor = `#${rgb.map((channel) => Math.round((channel + offset) * 255)
    .toString(16)
    .padStart(2, '0')).join('')}`;

  document.documentElement.style.setProperty('--accent', tonedColor);
  accentColorPicker.value = color;
  localStorage.setItem('vkt-accent', color);
}

function setAccountMenuOpen(isOpen) {
  accountMenuPanel.hidden = !isOpen;
  accountMenuToggle.setAttribute('aria-expanded', String(isOpen));
}

setTheme(initialTheme);
setAccentColor(initialAccent);
accountMenuToggle.addEventListener('click', () => {
  setAccountMenuOpen(accountMenuPanel.hidden);
});

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

notificationsToggle.addEventListener('click', () => {
  const isOpen = notificationsPanel.hidden;
  notificationsPanel.hidden = !isOpen;
  notificationsToggle.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    setAccountMenuOpen(false);
    markNotificationsAsSeen();
  }
});
notificationsClose.addEventListener('click', () => {
  notificationsPanel.hidden = true;
  notificationsToggle.setAttribute('aria-expanded', 'false');
  notificationsToggle.focus();
});

accentColorPicker.addEventListener('input', () => setAccentColor(accentColorPicker.value));
accentColorPicker.addEventListener('change', () => setAccentColor(accentColorPicker.value));

document.addEventListener('click', (event) => {
  if (!accountMenu.contains(event.target)) setAccountMenuOpen(false);
  if (!event.target.closest('.notification-menu')) {
    notificationsPanel.hidden = true;
    notificationsToggle.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!accountMenuPanel.hidden) {
      setAccountMenuOpen(false);
      accountMenuToggle.focus();
    }
    if (!notificationsPanel.hidden) {
      notificationsPanel.hidden = true;
      notificationsToggle.setAttribute('aria-expanded', 'false');
      notificationsToggle.focus();
    }
  }
});

navItems.forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
mobileView?.addEventListener('change', () => showView(mobileView.value));
mobileChatBackButton.addEventListener('click', () => {
  messenger.classList.remove('has-selected-chat');
  conversationContent.hidden = true;
  conversationPlaceholder.hidden = false;
  selectedChatId = '';
  stopWatchingMessages?.();
  mobileChatBackButton.blur();
});
findFriendsButton?.addEventListener('click', () => {
  showView('friends');
  const firstAction = registeredUsersList.querySelector('.friend-action:not(:disabled)');
  if (firstAction) firstAction.focus();
  else registeredUsersList.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.querySelector('#user-profile-back')?.addEventListener('click', () => showView('friends'));
profileMessageButton?.addEventListener('click', () => {
  if (selectedPublicProfile) openChatWithProfile(selectedPublicProfile);
});
profileBlockButton?.addEventListener('click', async () => {
  if (!currentUser || !selectedPublicProfile) return;
  const targetId = selectedPublicProfile.id;
  try {
    if (blockedUserIds.has(targetId)) {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'blocks', targetId));
      blockedUserIds.delete(targetId);
      refreshPublicProfileFriendAction();
      renderFriendUsers();
      renderChatList();
      showToast('Пользователь разблокирован.');
    } else {
      await setDoc(doc(db, 'users', currentUser.uid, 'blocks', targetId), {
        blockedUserId: targetId,
        createdAt: serverTimestamp()
      });
      blockedUserIds.add(targetId);
      refreshPublicProfileFriendAction();
      renderFriendUsers();
      renderChatList();
      const chatId = getChatId(currentUser.uid, targetId);
      if (socialChats.some((chat) => chat.id === chatId)) {
        selectedChatId = '';
        messenger.classList.remove('has-selected-chat');
        stopWatchingMessages?.();
        conversationContent.hidden = true;
        conversationPlaceholder.hidden = false;
        chatMessages.replaceChildren();
      }
      showToast('Пользователь заблокирован.');
    }
  } catch (error) {
    showToast(error?.code === 'permission-denied'
      ? 'Не удалось изменить блокировку. Проверь правила Firestore.'
      : 'Не удалось изменить блокировку. Попробуй ещё раз.');
  }
});
document.querySelectorAll('[data-view-link]').forEach((button) => {
  button.addEventListener('click', () => {
    showView(button.dataset.viewLink);
    if (accountMenu.contains(button)) setAccountMenuOpen(false);
  });
});

chatSearch.addEventListener('input', () => {
  renderChatList();
});
const toggleChatArchiveView = () => {
  showArchivedChats = !showArchivedChats;
  renderChatList();
};
archiveToggle.addEventListener('click', toggleChatArchiveView);
chatMessageForm.addEventListener('submit', sendChatMessage);
chatEmojiToggle.addEventListener('click', toggleEmojiPicker);
voiceRecordButton.addEventListener('click', startVoiceRecording);
voiceStopButton.addEventListener('click', () => stopVoiceRecording(false));

document.addEventListener('click', (event) => {
  if (!event.target.closest('.chat-row')) closeChatMenus();
  if (!event.target.closest('#chat-emoji-picker, #chat-emoji-toggle')) {
    chatEmojiPicker.hidden = true;
    chatEmojiToggle.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeChatMenus();
    chatEmojiPicker.hidden = true;
    chatEmojiToggle.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('click', (event) => {
  const noticeButton = event.target.closest('[data-notice]');
  if (noticeButton) showToast(noticeButton.dataset.notice);
});

document.querySelector('#post-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.post;
  const post = input.value.trim();
  if (!post) return;

  const article = document.createElement('article');
  article.className = 'card post-card';
  const author = document.createElement('div');
  author.className = 'post-author';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = currentProfileInitials;
  if (currentProfilePhotoUrl) {
    const image = document.createElement('img');
    image.src = currentProfilePhotoUrl;
    image.alt = '';
    avatar.replaceChildren(image);
  }
  const authorDetails = document.createElement('div');
  const authorName = document.createElement('strong');
  authorName.textContent = currentProfileName;
  const postedAt = document.createElement('span');
  postedAt.textContent = 'Только что';
  authorDetails.append(authorName, postedAt);
  author.append(avatar, authorDetails);
  const copy = document.createElement('p');
  copy.className = 'post-copy';
  copy.textContent = post;
  const actions = document.createElement('div');
  actions.className = 'post-actions';
  actions.innerHTML = '<button type="button" class="like-button">♡ <span>0</span></button><button type="button" data-notice="Комментарии скоро появятся.">◯ 0</button><button type="button" data-notice="Ссылка скопирована.">↗ Поделиться</button>';
  article.append(author, copy, actions);
  const feedList = document.querySelector('#feed-list');
  feedList.querySelector('.empty-state')?.remove();
  feedList.prepend(article);
  form.reset();
  showToast('Запись добавлена в ленту.');
});

document.addEventListener('click', (event) => {
  const likeButton = event.target.closest('.like-button');
  if (!likeButton) return;
  const count = likeButton.querySelector('span');
  const nextLiked = likeButton.classList.toggle('is-liked');
  likeButton.firstChild.textContent = nextLiked ? '♥ ' : '♡ ';
  count.textContent = String(Number(count.textContent) + (nextLiked ? 1 : -1));
});

document.querySelector('#community-search')?.addEventListener('input', (event) => {
  const query = event.target.value.trim().toLocaleLowerCase('ru');
  document.querySelectorAll('.community-card').forEach((card) => {
    card.hidden = !card.dataset.searchable.includes(query)
      && !card.textContent.toLocaleLowerCase('ru').includes(query);
  });
});

document.querySelectorAll('.join-button').forEach((button) => {
  button.addEventListener('click', () => {
    const isJoined = button.classList.toggle('is-joined');
    button.textContent = isJoined ? 'Вы подписаны' : 'Подписаться';
  });
});

const youtubeApiKeyStorageKey = 'vkt-youtube-api-key';
const youtubeApiKeyInput = document.querySelector('#youtube-api-key');
const musicConnectionForm = document.querySelector('#music-connection-form');
const musicSearchForm = document.querySelector('#music-search-form');
const musicSearchInput = document.querySelector('#music-search-input');
const musicTrackList = document.querySelector('#track-list');
const musicResultsCount = document.querySelector('#music-results-count');
const userPlaylistsList = document.querySelector('#user-playlists-list');
const playlistCreateOpenButton = document.querySelector('#playlist-create-open');
const playlistDialog = document.querySelector('#playlist-dialog');
const playlistDialogCloseButton = document.querySelector('#playlist-dialog-close');
const playlistDialogCancelButton = document.querySelector('#playlist-dialog-cancel');
const playlistForm = document.querySelector('#playlist-form');
const playlistChoices = document.querySelector('#playlist-choices');
const playlistChoiceList = document.querySelector('#playlist-choice-list');
const playlistNameInput = document.querySelector('#playlist-name');
const playlistFormMessage = document.querySelector('#playlist-form-message');
const playlistSubmitButton = document.querySelector('#playlist-submit');
const playlistDialogTitle = document.querySelector('#playlist-dialog-title');
const youtubePlayer = document.querySelector('#youtube-player');
const youtubePlayerPlaceholder = document.querySelector('#youtube-player-placeholder');
const transportTitle = document.querySelector('#transport-title');
const transportChannel = document.querySelector('#transport-channel');
const previousTrackButton = document.querySelector('#music-previous');
const playPauseButton = document.querySelector('#music-play-pause');
const nextTrackButton = document.querySelector('#music-next');
const repeatTrackButton = document.querySelector('#music-repeat');
const musicVolumeInput = document.querySelector('#music-volume');
let musicSearchAbortController;
let musicRequestNumber = 0;
let youtubeNextPageToken = '';
let youtubeLastSearch = { query: '', order: 'relevance' };
let musicQueue = [];
let selectedVideoIndex = -1;
let youtubePlayerApiPromise;
let youtubePlayerReadyPromise;
let youtubePlayerInstance;
let repeatPlaylist = false;
let musicPlaylists = [];
let playlistTargetTrack = null;

function getMusicPlaylistsStorageKey() {
  return `vkt-music-playlists:${currentUser?.uid || 'local'}`;
}

function saveMusicPlaylists() {
  localStorage.setItem(getMusicPlaylistsStorageKey(), JSON.stringify(musicPlaylists));
}

function loadMusicPlaylists() {
  const savedPlaylists = localStorage.getItem(getMusicPlaylistsStorageKey());
  if (!savedPlaylists) {
    musicPlaylists = [];
    renderMusicPlaylists();
    return;
  }

  try {
    const parsedPlaylists = JSON.parse(savedPlaylists);
    musicPlaylists = Array.isArray(parsedPlaylists)
      ? parsedPlaylists.filter((playlist) => typeof playlist.id === 'string'
        && typeof playlist.name === 'string'
        && Array.isArray(playlist.tracks))
        .map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          tracks: playlist.tracks.filter((track) => typeof track.id === 'string'
            && typeof track.title === 'string'
            && typeof track.channelTitle === 'string')
            .map((track) => ({
              id: track.id,
              snippet: {
                title: track.title,
                channelTitle: track.channelTitle,
                thumbnails: track.thumbnails || {}
              }
            }))
        }))
      : [];
  } catch (error) {
    console.error('Не удалось прочитать сохранённые плейлисты:', error);
    musicPlaylists = [];
  }
  renderMusicPlaylists();
}

function renderMusicPlaylists() {
  userPlaylistsList.replaceChildren();
  if (!musicPlaylists.length) {
    appendTextElement(userPlaylistsList, 'div', 'empty-state', 'Пока нет плейлистов. Добавляй видео из результатов поиска.');
    return;
  }

  musicPlaylists.forEach((playlist) => {
    const row = document.createElement('article');
    row.className = 'user-playlist-row';
    const header = document.createElement('div');
    header.className = 'user-playlist-header';
    const toggleButton = document.createElement('button');
    toggleButton.className = 'user-playlist-toggle';
    toggleButton.type = 'button';
    toggleButton.setAttribute('aria-expanded', 'false');
    const details = document.createElement('span');
    details.className = 'user-playlist-info';
    appendTextElement(details, 'strong', '', playlist.name);
    appendTextElement(details, 'small', '', `${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'трек' : 'треков'}`);
    const expandIcon = appendTextElement(toggleButton, 'span', 'user-playlist-expand-icon', '⌄');
    expandIcon.setAttribute('aria-hidden', 'true');
    toggleButton.prepend(details);
    const trackList = document.createElement('ul');
    trackList.className = 'playlist-track-list';
    trackList.id = `music-playlist-tracks-${playlist.id}`;
    trackList.hidden = true;
    toggleButton.setAttribute('aria-controls', trackList.id);
    if (!playlist.tracks.length) {
      appendTextElement(trackList, 'li', 'playlist-track-empty', 'В плейлисте пока нет треков.');
    }
    toggleButton.addEventListener('click', () => {
      const isExpanded = toggleButton.getAttribute('aria-expanded') !== 'true';
      toggleButton.setAttribute('aria-expanded', String(isExpanded));
      trackList.hidden = !isExpanded;
    });
    playlist.tracks.forEach((track, index) => {
      const trackRow = document.createElement('li');
      trackRow.className = 'playlist-track-row';
      const trackButton = appendTextElement(trackRow, 'button', 'playlist-track-play', '');
      trackButton.type = 'button';
      trackButton.setAttribute('aria-label', `Воспроизвести ${track.snippet.title}`);
      appendTextElement(trackButton, 'strong', '', track.snippet.title);
      appendTextElement(trackButton, 'small', '', track.snippet.channelTitle);
      trackButton.addEventListener('click', () => {
        musicQueue = playlist.tracks;
        repeatPlaylist = false;
        updateSelectedVideo(index);
        updateTransportControls(false);
        playQueueItem(index);
      });
      const removeTrackButton = appendTextElement(trackRow, 'button', 'playlist-delete-button', 'Удалить');
      removeTrackButton.type = 'button';
      removeTrackButton.setAttribute('aria-label', `Удалить «${track.snippet.title}» из плейлиста «${playlist.name}»`);
      removeTrackButton.addEventListener('click', () => removeTrackFromPlaylist(playlist, index));
      trackList.append(trackRow);
    });
    const actions = document.createElement('div');
    actions.className = 'user-playlist-actions';
    const playButton = appendTextElement(actions, 'button', 'outline-button', '▶ Слушать');
    playButton.type = 'button';
    playButton.disabled = !playlist.tracks.length;
    playButton.addEventListener('click', () => {
      musicQueue = playlist.tracks;
      repeatPlaylist = false;
      updateSelectedVideo(0);
      updateTransportControls(false);
      playQueueItem(0);
    });
    const deleteButton = appendTextElement(actions, 'button', 'playlist-delete-button', 'Удалить');
    deleteButton.type = 'button';
    deleteButton.setAttribute('aria-label', `Удалить плейлист «${playlist.name}»`);
    deleteButton.addEventListener('click', () => {
      musicPlaylists = musicPlaylists.filter((item) => item.id !== playlist.id);
      saveMusicPlaylists();
      renderMusicPlaylists();
    });
    header.append(toggleButton, actions);
    row.append(header, trackList);
    userPlaylistsList.append(row);
  });
}

function removeTrackFromPlaylist(playlist, trackIndex) {
  const wasPlayingPlaylist = musicQueue === playlist.tracks;
  playlist.tracks.splice(trackIndex, 1);
  saveMusicPlaylists();
  renderMusicPlaylists();

  if (!wasPlayingPlaylist) {
    showToast('Трек удалён из плейлиста.');
    return;
  }
  if (!playlist.tracks.length) {
    youtubePlayerInstance?.stopVideo();
    selectedVideoIndex = -1;
    transportTitle.textContent = 'Выбери видео из списка';
    transportChannel.textContent = 'YouTube Music';
    updateTransportControls(false);
    showToast('Трек удалён. Плейлист пуст.');
    return;
  }

  const nextIndex = trackIndex < selectedVideoIndex
    ? selectedVideoIndex - 1
    : Math.min(selectedVideoIndex, playlist.tracks.length - 1);
  playQueueItem(nextIndex, false);
  showToast('Трек удалён из плейлиста.');
}

function renderPlaylistChoices() {
  playlistChoiceList.replaceChildren();
  playlistChoices.hidden = !playlistTargetTrack || musicPlaylists.length === 0;
  playlistSubmitButton.textContent = playlistTargetTrack ? 'Добавить трек' : 'Создать плейлист';
  if (!playlistTargetTrack || !musicPlaylists.length) return;

  musicPlaylists.forEach((playlist) => {
    const label = document.createElement('label');
    label.className = 'playlist-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'playlistId';
    input.value = playlist.id;
    const text = document.createElement('span');
    text.textContent = `${playlist.name} (${playlist.tracks.length})`;
    label.append(input, text);
    playlistChoiceList.append(label);
  });
}

function openPlaylistDialog(track = null) {
  playlistTargetTrack = track;
  playlistForm.reset();
  playlistFormMessage.hidden = true;
  playlistFormMessage.textContent = '';
  playlistDialogTitle.textContent = track ? 'Добавить трек в плейлист' : 'Создать плейлист';
  renderPlaylistChoices();
  playlistDialog.showModal();
  playlistNameInput.focus();
}

function makePlaylistTrack(video) {
  return {
    id: video.id,
    title: video.snippet.title,
    channelTitle: video.snippet.channelTitle,
    thumbnails: video.snippet.thumbnails || {}
  };
}

function addTrackToPlaylist(playlist, track) {
  if (playlist.tracks.some((item) => item.id === track.id)) return false;
  playlist.tracks.push({
    id: track.id,
    snippet: {
      title: track.title,
      channelTitle: track.channelTitle,
      thumbnails: track.thumbnails || {}
    }
  });
  return true;
}

function updateTransportControls(isPlaying = false) {
  const hasSelection = selectedVideoIndex >= 0 && selectedVideoIndex < musicQueue.length;
  const canGoPrevious = hasSelection && (selectedVideoIndex > 0 || repeatPlaylist);
  const canGoNext = hasSelection && (selectedVideoIndex < musicQueue.length - 1 || repeatPlaylist);
  previousTrackButton.disabled = !canGoPrevious;
  nextTrackButton.disabled = !canGoNext;
  playPauseButton.disabled = !hasSelection;
  repeatTrackButton.disabled = !hasSelection || musicQueue.length < 2;
  playPauseButton.textContent = isPlaying ? 'Ⅱ' : '▶';
  playPauseButton.setAttribute('aria-label', isPlaying ? 'Пауза' : 'Воспроизвести');
  playPauseButton.title = isPlaying ? 'Пауза' : 'Воспроизвести';
  repeatTrackButton.setAttribute('aria-pressed', String(repeatPlaylist));
  repeatTrackButton.setAttribute('aria-label', repeatPlaylist ? 'Повтор списка включён' : 'Повтор списка выключен');
  repeatTrackButton.title = repeatPlaylist ? 'Повтор списка включён' : 'Повтор списка выключен';
}

function updateSelectedVideo(index) {
  if (index < 0 || index >= musicQueue.length) return;
  selectedVideoIndex = index;
  const { id, snippet } = musicQueue[index];
  transportTitle.textContent = snippet.title;
  transportChannel.textContent = snippet.channelTitle;
  musicTrackList.querySelectorAll('.track-row').forEach((row) => {
    const isSelected = row.dataset.videoId === id;
    row.classList.toggle('is-playing', isSelected);
    row.setAttribute('aria-current', isSelected ? 'true' : 'false');
  });
  updateTransportControls(youtubePlayerInstance?.getPlayerState() === window.YT?.PlayerState.PLAYING);
}

function loadYouTubePlayerApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubePlayerApiPromise) return youtubePlayerApiPromise;

  youtubePlayerApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    window.onYouTubeIframeAPIReady = resolve;
    script.onerror = () => {
      youtubePlayerApiPromise = null;
      reject(new Error('Не удалось загрузить YouTube-плеер.'));
    };
    document.head.append(script);
  });
  return youtubePlayerApiPromise;
}

async function ensureYouTubePlayer() {
  await loadYouTubePlayerApi();
  if (youtubePlayerReadyPromise) return youtubePlayerReadyPromise;

  youtubePlayer.hidden = false;
  youtubePlayerPlaceholder.hidden = true;
  youtubePlayerReadyPromise = new Promise((resolve, reject) => {
    try {
      youtubePlayerInstance = new window.YT.Player('youtube-player', {
        width: '480',
        height: '270',
        playerVars: {
          playsinline: 1,
          rel: 0,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            event.target.setVolume(Number(musicVolumeInput.value));
            updateTransportControls(false);
            resolve(event.target);
          },
          onStateChange: (event) => {
            const { PlayerState } = window.YT;
            if (event.data === PlayerState.PLAYING) {
              const playlistIndex = event.target.getPlaylistIndex();
              if (playlistIndex >= 0 && playlistIndex < musicQueue.length) {
                updateSelectedVideo(playlistIndex);
              }
              updateTransportControls(true);
            } else if (event.data === PlayerState.ENDED) {
              const nextIndex = selectedVideoIndex + 1;
              if (nextIndex < musicQueue.length) {
                playQueueItem(nextIndex, false);
              } else if (repeatPlaylist && musicQueue.length > 1) {
                playQueueItem(0, false);
              } else {
                updateTransportControls(false);
              }
            } else if (event.data === PlayerState.PAUSED) {
              updateTransportControls(false);
            }
          },
          onError: (event) => {
            console.error('Ошибка YouTube-плеера:', event.data);
            showToast('Это видео нельзя воспроизвести во встроенном плеере.');
            updateTransportControls(false);
          }
        }
      });
    } catch (error) {
      youtubePlayerInstance = null;
      youtubePlayerReadyPromise = null;
      reject(error);
    }
  });
  return youtubePlayerReadyPromise;
}

async function playQueueItem(index, scrollToPlayer = true) {
  if (index < 0 || index >= musicQueue.length) return;
  updateSelectedVideo(index);
  youtubePlayer.hidden = false;
  youtubePlayerPlaceholder.hidden = true;
  if (scrollToPlayer) {
    document.querySelector('.youtube-player-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  try {
    const player = await ensureYouTubePlayer();
    const playlist = musicQueue.map((video) => video.id);
    player.loadPlaylist(playlist, index, 0);
    player.setLoop(repeatPlaylist);
    player.setVolume(Number(musicVolumeInput.value));
  } catch (error) {
    console.error('Не удалось запустить YouTube-плеер:', error);
    showToast(error.message || 'Не удалось запустить YouTube-плеер.');
  }
}

function moveInQueue(direction) {
  if (selectedVideoIndex < 0 || !musicQueue.length) return;
  let nextIndex = selectedVideoIndex + direction;
  if (nextIndex < 0 || nextIndex >= musicQueue.length) {
    if (!repeatPlaylist) return;
    nextIndex = (nextIndex + musicQueue.length) % musicQueue.length;
  }
  if (nextIndex !== selectedVideoIndex) playQueueItem(nextIndex, false);
}

function setMusicStatus(message) {
  youtubePlayerInstance?.stopVideo();
  musicTrackList.replaceChildren();
  musicQueue = [];
  selectedVideoIndex = -1;
  transportTitle.textContent = 'Выбери видео из списка';
  transportChannel.textContent = 'YouTube Music';
  appendTextElement(musicTrackList, 'li', 'empty-state', message);
  musicResultsCount.textContent = '';
  youtubeNextPageToken = '';
  updateTransportControls(false);
  updateYouTubeMoreButton();
}

function updateYouTubeMoreButton() {
  let button = document.querySelector('#youtube-load-more');
  if (!button) {
    button = document.createElement('button');
    button.id = 'youtube-load-more';
    button.className = 'outline-button youtube-load-more';
    button.type = 'button';
    button.textContent = 'Загрузить ещё';
    button.addEventListener('click', () => {
      searchYouTubeVideos(youtubeLastSearch.query, youtubeLastSearch.order, youtubeNextPageToken, true);
    });
    musicTrackList.after(button);
  }
  button.hidden = !youtubeNextPageToken;
}

function renderYouTubeVideos(videos, append = false) {
  if (!append) {
    musicTrackList.replaceChildren();
    musicQueue = [];
    selectedVideoIndex = -1;
    transportTitle.textContent = 'Выбери видео из списка';
    transportChannel.textContent = 'YouTube Music';
  }
  const validVideos = videos.filter(({ id, snippet }) => /^[\w-]{11}$/.test(id?.videoId || '') && snippet);
  const knownVideoIds = new Set(musicQueue.map((video) => video.id));
  validVideos.forEach(({ id, snippet }) => {
    if (knownVideoIds.has(id.videoId)) return;
    knownVideoIds.add(id.videoId);
    musicQueue.push({ id: id.videoId, snippet });
  });
  if (!validVideos.length && !append) {
    setMusicStatus('По этому запросу ничего не найдено.');
    return;
  }

  validVideos.forEach(({ id, snippet }) => {
    const videoId = id.videoId;
    if (musicTrackList.querySelector(`[data-video-id="${videoId}"]`)) return;
    const item = document.createElement('li');
    item.className = 'track-result';
    const button = document.createElement('button');
    button.className = 'track-row';
    button.type = 'button';
    button.dataset.videoId = videoId;
    button.setAttribute('aria-label', `Воспроизвести ${snippet.title} — ${snippet.channelTitle}`);
    const cover = document.createElement('img');
    cover.className = 'track-cover';
    cover.src = snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '';
    cover.alt = `Обложка видео: ${snippet.title}`;
    cover.loading = 'lazy';
    cover.onerror = () => {
      cover.hidden = true;
      const fallback = document.createElement('span');
      fallback.className = 'track-cover track-cover-fallback';
      fallback.textContent = '▶';
      cover.replaceWith(fallback);
    };
    const info = document.createElement('span');
    info.className = 'track-info';
    appendTextElement(info, 'strong', '', snippet.title);
    appendTextElement(info, 'small', '', snippet.channelTitle);
    const attribution = document.createElement('a');
    attribution.className = 'track-attribution';
    attribution.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    attribution.target = '_blank';
    attribution.rel = 'noopener noreferrer';
    attribution.textContent = 'Открыть на YouTube';
    attribution.addEventListener('click', (event) => event.stopPropagation());
    info.append(attribution);
    button.prepend(cover, info);
    button.addEventListener('click', () => playQueueItem(musicQueue.findIndex((video) => video.id === videoId)));
    item.append(button);
    const addButton = appendTextElement(item, 'button', 'track-add-button', '＋');
    addButton.type = 'button';
    addButton.setAttribute('aria-label', `Добавить «${snippet.title}» в плейлист`);
    addButton.title = 'Добавить в плейлист';
    addButton.addEventListener('click', () => openPlaylistDialog({
      id: videoId,
      snippet: {
        title: snippet.title,
        channelTitle: snippet.channelTitle,
        thumbnails: snippet.thumbnails || {}
      }
    }));
    musicTrackList.append(item);
  });
  musicResultsCount.textContent = `${musicTrackList.querySelectorAll('.track-row').length} видео`;
  updateTransportControls(false);
  updateYouTubeMoreButton();
}

async function searchYouTubeVideos(searchTerm = '', order = 'relevance', pageToken = '', append = false) {
  const apiKey = localStorage.getItem(youtubeApiKeyStorageKey)?.trim();
  if (!apiKey) {
    setMusicStatus('Подключи YouTube Data API, чтобы искать видео.');
    document.querySelector('.music-connection').open = true;
    youtubeApiKeyInput.focus();
    return;
  }
  musicCatalogLoaded = true;

  musicSearchAbortController?.abort();
  musicSearchAbortController = new AbortController();
  const requestNumber = ++musicRequestNumber;
  const params = new URLSearchParams({
    key: apiKey,
    part: 'snippet',
    type: 'video',
    maxResults: '25',
    order,
    safeSearch: 'moderate',
    regionCode: 'RU',
    relevanceLanguage: 'ru',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    q: searchTerm || 'music'
  });
  if (pageToken) params.set('pageToken', pageToken);
  if (!append) {
    youtubeLastSearch = { query: searchTerm, order };
    youtubeNextPageToken = '';
    setMusicStatus('Ищу видео на YouTube…');
  }

  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      signal: musicSearchAbortController.signal
    });
    const result = await response.json();
    if (requestNumber !== musicRequestNumber) return;
    if (!response.ok) {
      const reason = result.error?.errors?.[0]?.reason;
      const message = reason === 'quotaExceeded'
        ? 'Исчерпан дневной лимит YouTube API.'
        : result.error?.message || `YouTube API вернул HTTP ${response.status}.`;
      throw new Error(message);
    }
    youtubeNextPageToken = result.nextPageToken || '';
    renderYouTubeVideos(Array.isArray(result.items) ? result.items : [], append);
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Не удалось выполнить поиск на YouTube:', error);
    if (requestNumber === musicRequestNumber) {
      musicCatalogLoaded = false;
      setMusicStatus(`Не удалось выполнить поиск: ${error.message}`);
    }
  }
}

musicConnectionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const apiKey = youtubeApiKeyInput.value.trim();
  if (!apiKey) {
    showToast('Введи ключ YouTube Data API.');
    return;
  }
  localStorage.setItem(youtubeApiKeyStorageKey, apiKey);
  document.querySelector('.music-connection').open = false;
  searchYouTubeVideos(musicSearchInput.value.trim() || 'music');
});

musicSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = musicSearchInput.value.trim();
  if (!query) {
    showToast('Введи название трека или исполнителя.');
    musicSearchInput.focus();
    return;
  }
  searchYouTubeVideos(query);
});

const savedYouTubeApiKey = localStorage.getItem(youtubeApiKeyStorageKey);
if (savedYouTubeApiKey) youtubeApiKeyInput.value = savedYouTubeApiKey;

playlistCreateOpenButton.addEventListener('click', () => openPlaylistDialog());
playlistDialogCloseButton.addEventListener('click', () => playlistDialog.close());
playlistDialogCancelButton.addEventListener('click', () => playlistDialog.close());
playlistNameInput.addEventListener('input', () => {
  playlistSubmitButton.textContent = playlistNameInput.value.trim()
    ? 'Создать плейлист'
    : playlistTargetTrack ? 'Добавить трек' : 'Создать плейлист';
});
playlistForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const playlistName = playlistNameInput.value.trim();
  playlistFormMessage.hidden = true;

  if (playlistName) {
    const duplicateName = musicPlaylists.some((playlist) => playlist.name.toLocaleLowerCase('ru') === playlistName.toLocaleLowerCase('ru'));
    if (duplicateName) {
      playlistFormMessage.textContent = 'Плейлист с таким названием уже существует.';
      playlistFormMessage.hidden = false;
      playlistNameInput.focus();
      return;
    }
    const playlist = {
      id: crypto.randomUUID(),
      name: playlistName,
      tracks: []
    };
    if (playlistTargetTrack) addTrackToPlaylist(playlist, makePlaylistTrack(playlistTargetTrack));
    musicPlaylists.push(playlist);
    saveMusicPlaylists();
    renderMusicPlaylists();
    playlistDialog.close();
    showToast(playlistTargetTrack ? 'Плейлист создан, трек добавлен.' : 'Плейлист создан.');
    return;
  }

  const selectedPlaylistId = playlistForm.querySelector('input[name="playlistId"]:checked')?.value;
  const selectedPlaylist = musicPlaylists.find((playlist) => playlist.id === selectedPlaylistId);
  if (!selectedPlaylist || !playlistTargetTrack) {
    playlistFormMessage.textContent = 'Выбери плейлист или введи название нового.';
    playlistFormMessage.hidden = false;
    return;
  }
  if (!addTrackToPlaylist(selectedPlaylist, makePlaylistTrack(playlistTargetTrack))) {
    playlistFormMessage.textContent = 'Этот трек уже есть в плейлисте.';
    playlistFormMessage.hidden = false;
    return;
  }
  saveMusicPlaylists();
  renderMusicPlaylists();
  playlistDialog.close();
  showToast('Трек добавлен в плейлист.');
});

previousTrackButton.addEventListener('click', () => moveInQueue(-1));
nextTrackButton.addEventListener('click', () => moveInQueue(1));
playPauseButton.addEventListener('click', async () => {
  if (selectedVideoIndex < 0) return;
  try {
    const player = await ensureYouTubePlayer();
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  } catch (error) {
    console.error('Не удалось управлять воспроизведением YouTube:', error);
    showToast(error.message || 'Не удалось управлять воспроизведением.');
  }
});
repeatTrackButton.addEventListener('click', () => {
  repeatPlaylist = !repeatPlaylist;
  youtubePlayerInstance?.setLoop(repeatPlaylist);
  updateTransportControls(youtubePlayerInstance?.getPlayerState() === window.YT?.PlayerState.PLAYING);
});
musicVolumeInput.addEventListener('input', () => {
  youtubePlayerInstance?.setVolume(Number(musicVolumeInput.value));
});
updateTransportControls(false);

document.querySelector('#global-search')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const query = event.currentTarget.value.trim().toLocaleLowerCase('ru');
  if (!query) return;
  const searchableViews = ['feed', 'friends', 'communities', 'messages', 'music'];
  const match = searchableViews.find((viewName) => {
    const panel = document.querySelector(`[data-panel="${viewName}"]`);
    return panel.textContent.toLocaleLowerCase('ru').includes(query);
  });
  if (match) {
    showView(match);
    showToast(`Показан раздел «${panels.find((panel) => panel.dataset.panel === match).querySelector('h1').textContent}».`);
  } else {
    showToast('Ничего не найдено.');
  }
});

const authStatus = document.querySelector('#auth-status');

function showAuthStatus(message) {
  authStatus.textContent = message;
  authStatus.hidden = false;
}

function populateUserProfile(user, profile, photoUrl) {
  const firstName = typeof profile.firstName === 'string' ? profile.firstName : '';
  const lastName = typeof profile.lastName === 'string' ? profile.lastName : '';
  const nickname = typeof profile.nickname === 'string' && profile.nickname.trim()
    ? profile.nickname.trim()
    : 'профиль';
  const fullName = `${firstName} ${lastName}`.trim() || user.displayName || `@${nickname}`;
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('ru');
  currentProfileName = fullName;
  currentProfileInitials = initials || 'V';
  currentProfileFirstName = firstName;
  currentProfileLastName = lastName;
  currentProfileNickname = typeof profile.nickname === 'string' ? profile.nickname.trim() : '';
  currentUser = user;
  loadMusicPlaylists();

  document.querySelectorAll('[data-user-name]').forEach((element) => {
    element.textContent = fullName;
  });
  renderProfilePhoto(photoUrl);
  document.querySelector('[data-profile-name]').textContent = fullName;
  document.querySelector('[data-profile-nickname]').textContent = `@${nickname}`;
  document.querySelector('[data-user-nickname]').textContent = `@${nickname}`;
}

function openProfilePhotoPicker() {
  profilePhotoInput?.click();
}

profileEditOpenButton?.addEventListener('click', () => {
  profileEditMessage.hidden = true;
  profileEditMessage.textContent = '';
  profileEditForm.reset();
  profileFirstNameInput.value = currentProfileFirstName;
  profileLastNameInput.value = currentProfileLastName;
  profileNicknameInput.value = currentProfileNickname;
  profileEditDialog?.showModal();
});
profileEditCloseButton?.addEventListener('click', () => profileEditDialog?.close());
profilePhotoButton?.addEventListener('click', openProfilePhotoPicker);
profileEditForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const firstName = profileFirstNameInput.value.trim();
  const lastName = profileLastNameInput.value.trim();
  const nickname = profileNicknameInput.value.trim();
  if (!firstName || !lastName || !/^[A-Za-zА-Яа-яЁё0-9_]{3,24}$/.test(nickname)) {
    profileEditMessage.textContent = 'Проверь имя, фамилию и короткое имя.';
    profileEditMessage.hidden = false;
    return;
  }
  if (!currentUser || !db) {
    profileEditMessage.textContent = 'Не удалось определить аккаунт. Обнови страницу и попробуй снова.';
    profileEditMessage.hidden = false;
    return;
  }

  profileEditSaveButton.disabled = true;
  profileEditMessage.hidden = true;
  try {
    const profileUpdate = { firstName, lastName, nickname };
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', currentUser.uid), profileUpdate);
    batch.set(doc(db, 'publicProfiles', currentUser.uid), {
      ...profileUpdate,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await batch.commit();
    populateUserProfile(currentUser, { firstName, lastName, nickname }, currentProfilePhotoUrl);
    profileEditDialog?.close();
    showToast('Профиль обновлён.');
  } catch (error) {
    profileEditMessage.textContent = error?.code === 'permission-denied'
      ? 'Firebase запретил изменить профиль. Проверь правила Firestore.'
      : 'Не удалось сохранить изменения. Проверь соединение и попробуй снова.';
    profileEditMessage.hidden = false;
  } finally {
    profileEditSaveButton.disabled = false;
  }
});
profilePhotoInput?.addEventListener('change', async () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size >= 5 * 1024 * 1024) {
    showToast('Выбери изображение размером не более 5 МБ.');
    profilePhotoInput.value = '';
    return;
  }
  if (!currentUser || !db) {
    showToast('Не удалось определить аккаунт. Обнови страницу и попробуй снова.');
    profilePhotoInput.value = '';
    return;
  }

  profilePhotoButton?.setAttribute('disabled', '');
  try {
    const avatarDataUrl = await createProfileImageDataUrl(file);
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', currentUser.uid), { avatarDataUrl });
    batch.set(doc(db, 'publicProfiles', currentUser.uid), {
      firstName: currentProfileFirstName,
      lastName: currentProfileLastName,
      nickname: currentProfileNickname,
      avatarDataUrl,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await batch.commit();
    renderProfilePhoto(avatarDataUrl);
    showToast('Фотография профиля обновлена.');
    profileEditDialog?.close();
  } catch (error) {
    showToast(error?.code === 'permission-denied'
      ? 'Firebase запретил сохранить фото. Проверь правила Firestore.'
      : error?.message || 'Не удалось сохранить фотографию. Проверь соединение и попробуй снова.');
  } finally {
    profilePhotoButton?.removeAttribute('disabled');
    profilePhotoInput.value = '';
  }
});


if (!firebaseReady || !auth || !db) {
  showAuthStatus('Сайт подключён к Firebase не полностью. Добавь настройки веб-приложения в js/firebase-config.js.');
} else {
  persistenceReady
    .then(() => {
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          window.location.replace('authorization.html');
          return;
        }

        try {
          const profileSnapshot = await getDoc(doc(db, 'users', user.uid));
          const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
          const photoUrl = typeof profile.avatarDataUrl === 'string' ? profile.avatarDataUrl : '';
          populateUserProfile(user, profile, photoUrl);
          try {
            const publicProfile = {
              firstName: typeof profile.firstName === 'string' ? profile.firstName : '',
              lastName: typeof profile.lastName === 'string' ? profile.lastName : '',
              nickname: typeof profile.nickname === 'string' ? profile.nickname : 'профиль',
              updatedAt: serverTimestamp()
            };
            if (photoUrl) publicProfile.avatarDataUrl = photoUrl;
            await setDoc(doc(db, 'publicProfiles', user.uid), publicProfile, { merge: true });
          } catch {
            showToast('Не удалось обновить общедоступный профиль. Проверь правила Firestore.');
          }
          watchSocialData(user);
          document.body.classList.remove('auth-pending');
          authStatus.hidden = true;
          const initialView = new URLSearchParams(window.location.search).get('view') || 'feed';
          showView(initialView);
        } catch (error) {
          showAuthStatus(error?.code === 'permission-denied'
            ? 'Нет доступа к профилю. Проверь правила Firestore в Firebase Console.'
            : 'Не удалось загрузить профиль из Firebase. Проверь подключение к интернету и настройки базы.');
        }
      });
    })
    .catch(() => {
      showAuthStatus('Не удалось включить сохранение сеанса Firebase. Проверь настройки проекта и попробуй снова.');
    });
}

document.querySelector('#logout-button')?.addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.replace('authorization.html');
  } catch {
    showToast('Не удалось выйти. Проверь подключение и попробуй снова.');
  }
});