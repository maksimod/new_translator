document.addEventListener('DOMContentLoaded', () => {
  const openTranslatorBtn = document.getElementById('openTranslator');
  
  openTranslatorBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openTranslator' }, (response) => {
      // После открытия окна переводчика закрываем popup
      window.close();
    });
  });
}); 