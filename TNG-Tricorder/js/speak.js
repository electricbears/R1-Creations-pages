// Simple wrapper so app.js doesn't care about SDK details.
window.tricorderSpeak = function (text) {
  if (typeof PluginMessageHandler === "undefined") {
    console.error("R1 PluginMessageHandler is not available.");
    return;
  }

  PluginMessageHandler.postMessage(
    JSON.stringify({
      message: `Speak this exactly and nothing else: ${text}`,
      useLLM: true,
      wantsR1Response: true,
      wantsJournalEntry: false
    })
  );
};

