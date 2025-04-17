// Объявляем глобальные переменные
let translatorWindow = null;

// Обработчик клика по иконке расширения
chrome.action.onClicked.addListener((tab) => {
  // Если окно уже открыто, фокусируемся на нем
  if (translatorWindow) {
    chrome.windows.update(translatorWindow.id, { focused: true });
  } else {
    // Иначе открываем новое окно
    openTranslatorWindow();
  }
});

// Функция для открытия окна переводчика
function openTranslatorWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('translator.html'),
    type: 'popup',
    width: 800,
    height: 600
  }, (win) => {
    translatorWindow = win;
    
    // Обработчик закрытия окна
    chrome.windows.onRemoved.addListener(function onWindowClose(windowId) {
      if (translatorWindow && windowId === translatorWindow.id) {
        translatorWindow = null;
        chrome.windows.onRemoved.removeListener(onWindowClose);
      }
    });
  });
}

// Функция для открытия окна переводчика из popup.html
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openTranslator') {
    if (translatorWindow) {
      chrome.windows.update(translatorWindow.id, { focused: true });
    } else {
      openTranslatorWindow();
    }
    sendResponse({ success: true });
  }
  return true;
});

// Запоминаем окно при перезагрузке расширения
chrome.runtime.onInstalled.addListener(() => {
  chrome.windows.getAll({ populate: true }, (windows) => {
    for (const window of windows) {
      if (window.tabs) {
        for (const tab of window.tabs) {
          if (tab.url && tab.url.startsWith(chrome.runtime.getURL('translator.html'))) {
            translatorWindow = window;
            break;
          }
        }
      }
      if (translatorWindow) break;
    }
  });
}); 