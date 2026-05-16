window.launcherSpeak = function (text, options) {
  const opts = options || {};

  if (typeof PluginMessageHandler === "undefined") {
    console.error("R1 PluginMessageHandler is not available.");
    return;
  }

  const voiceEnabled = (
    window.launcherSettings &&
    typeof window.launcherSettings.isVoiceEnabled === "function"
  ) ? window.launcherSettings.isVoiceEnabled() : true;

  const silent = Boolean(opts.silent) || !voiceEnabled;
  const payloadMessage = opts.rawMessage
    ? String(text)
    : `Speak this exactly and nothing else: ${text}`;

  PluginMessageHandler.postMessage(
    JSON.stringify({
      message: payloadMessage,
      useLLM: true,
      wantsR1Response: !silent,
      wantsJournalEntry: Boolean(opts.wantsJournalEntry)
    })
  );
};

