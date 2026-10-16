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

const navItems = [...document.querySelectorAll('.nav-item[data-view]')];
const panels = [...document.querySelectorAll('.view-panel[data-panel]')];
const mobileView = document.querySelector('#mobile-view');
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
const conversationPlaceholder = document.querySelector('#conversation-placeholder');
const conversationContent = document.querySelector('#conversation-content');
const chatMessages = document.querySelector('#chat-messages');
const chatMessageForm = document.querySelector('#chat-message-form');
const chatMessageInput = document.querySelector('#chat-message-input');
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
    hidden: false
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
      const otherUserId = chat.members.find((memberId) => memberId !== currentUser.uid);
      const profile = getProfileById(otherUserId);
      const name = profile?.fullName || 'Пользователь';
      const matchesSearch = `${name} ${profile?.nickname || ''} ${chat.lastMessage || ''}`
        .toLocaleLowerCase('ru')
        .includes(searchTerm);
      return { chat, profile, name, matchesSearch, settings: getCurrentChatSettings(chat.id) };
    })
    .filter((entry) => entry.matchesSearch)
    .sort((first, second) => Number(second.settings.pinned) - Number(first.settings.pinned)
      || getTimestampValue(second.chat.lastMessageAt) - getTimestampValue(first.chat.lastMessageAt));

  chatItems.replaceChildren();
  visibleChats.forEach(({ chat, profile, name, settings }) => {
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
    appendTextElement(details, 'small', '', chat.lastMessage || 'Начни переписку');
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
  if (!messages.length) {
    appendTextElement(chatMessages, 'div', 'messages-empty', 'Сообщений пока нет. Напиши первым!');
    return;
  }
  messages.forEach((message) => {
    const bubble = appendTextElement(chatMessages, 'p',
      `bubble${message.senderId === currentUser.uid ? ' bubble--outgoing' : ' bubble--incoming'}`,
      message.text);
    if (message.createdAt) {
      const time = appendTextElement(bubble, 'time', '', new Date(getTimestampValue(message.createdAt)).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }));
      time.dateTime = new Date(getTimestampValue(message.createdAt)).toISOString();
    }
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
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
  chatMessageInput.disabled = !canMessage;
  chatMessageForm.querySelector('button').disabled = !canMessage;
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
  const chat = socialChats.find((entry) => entry.id === selectedChatId);
  if (!text || !chat || !currentUser) return;
  const receiverId = chat.members.find((memberId) => memberId !== currentUser.uid);
  if (blockedUserIds.has(receiverId) || !areAcceptedFriends(currentUser.uid, receiverId)) {
    showToast(blockedUserIds.has(receiverId)
      ? 'Разблокируй пользователя, чтобы отправить сообщение.'
      : 'Добавь пользователя в друзья, чтобы отправить сообщение.');
    return;
  }

  const sendButton = chatMessageForm.querySelector('button');
  sendButton.disabled = true;
  try {
    const batch = writeBatch(db);
    const messageReference = doc(collection(db, 'chats', chat.id, 'messages'));
    batch.set(messageReference, {
      senderId: currentUser.uid,
      text,
      createdAt: serverTimestamp()
    });
    batch.update(doc(db, 'chats', chat.id), {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      lastMessageSender: currentUser.uid,
      lastMessageId: messageReference.id
    });
    batch.set(doc(db, 'chatSettings', currentUser.uid, 'chats', chat.id), {
      ...getCurrentChatSettings(chat.id),
      hidden: false,
      lastReadAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await batch.commit();
    chatMessageInput.value = '';
  } catch (error) {
    showToast(error?.code === 'permission-denied'
      ? 'Не удалось отправить сообщение. Проверь правила Firestore и статус дружбы.'
      : 'Не удалось отправить сообщение. Проверь подключение и попробуй снова.');
  } finally {
    sendButton.disabled = false;
    chatMessageInput.focus();
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

document.addEventListener('click', (event) => {
  if (!event.target.closest('.chat-row')) closeChatMenus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeChatMenus();
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

let selectedTrack = '';
let isPlaying = false;
const nowPlaying = document.querySelector('#now-playing');
const playerToggle = document.querySelector('#player-toggle');

function selectTrack(title) {
  selectedTrack = title;
  nowPlaying.textContent = title;
  document.querySelectorAll('.track-row').forEach((row) => {
    const isSelected = row.dataset.track === title;
    row.classList.toggle('is-playing', isSelected);
    row.querySelector('.track-play').textContent = isSelected && isPlaying ? 'Ⅱ' : '▶';
  });
  showToast('Демонстрационный плеер: аудиофайл не подключён.');
}

document.querySelectorAll('.track-row').forEach((row) => {
  row.addEventListener('click', () => selectTrack(row.dataset.track));
});

document.querySelector('[data-play-all]')?.addEventListener('click', () => {
  if (!selectedTrack) selectTrack('Тёплый свет');
  isPlaying = true;
  playerToggle.textContent = 'Ⅱ';
  playerToggle.setAttribute('aria-label', 'Приостановить');
});

playerToggle?.addEventListener('click', () => {
  if (!selectedTrack) {
    showToast('Сначала выбери трек. Аудиофайлы пока не подключены.');
    return;
  }
  isPlaying = !isPlaying;
  playerToggle.textContent = isPlaying ? 'Ⅱ' : '▶';
  playerToggle.setAttribute('aria-label', isPlaying ? 'Приостановить' : 'Воспроизвести');
  document.querySelectorAll('.track-row').forEach((row) => {
    if (row.dataset.track === selectedTrack) row.querySelector('.track-play').textContent = isPlaying ? 'Ⅱ' : '▶';
  });
  showToast('Демонстрационный плеер: аудиофайл не подключён.');
});

document.querySelector('#global-search')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const query = event.currentTarget.value.trim().toLocaleLowerCase('ru');
  if (!query) return;
  const searchableViews = ['feed', 'friends', 'communities', 'messages'];
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