export function getStartKeyboard() {
  return { 
    reply_markup: { 
      keyboard: [[{ text: "/start" }]], 
      resize_keyboard: true, 
      one_time_keyboard: false 
    } 
  };
}

export function getEndKeyboard() {
  return { 
    reply_markup: { 
      keyboard: [[{ text: "/end" }]], 
      resize_keyboard: true, 
      one_time_keyboard: false 
    } 
  };
}

export function getFinishReportKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Завершить отчет", callback_data: "finish_report" }]
      ]
    }
  };
}
