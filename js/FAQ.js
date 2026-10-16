['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});