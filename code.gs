// ========================================================================
//      GroupMe Bot: Latency-Optimized Multi-Group Repeater (With Help Menu)
// ========================================================================

const ACTUAL_COPILOT_USER_ID = "128934125";
const COPILOT_NICKNAME_FOR_MENTION = "@Copilot";

const DEFAULT_SETTINGS = {
  adminPrefix: "!",
  triggerPrefix: "",
  customPrompt: "",
  botId: ""
};

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("");
  
  try {
    const postData = JSON.parse(e.postData.contents);
    const { group_id, user_id, text, sender_type } = postData;
    
    if (sender_type !== 'user' || user_id === ACTUAL_COPILOT_USER_ID || !text) {
      return ContentService.createTextOutput("");
    }
    
    const messageText = text.trim();
    if (messageText.length === 0) return ContentService.createTextOutput("");

    const settings = getGroupSettings(group_id);
    const messageTextLower = messageText.toLowerCase();
    const adminPrefixLower = settings.adminPrefix.toLowerCase();
    
    // 2. ABSOLUTE GUARD FOR ADMIN COMMANDS
    if (messageTextLower.startsWith(adminPrefixLower)) {
      const commandBody = messageText.substring(settings.adminPrefix.length).trim();
      const commandBodyLower = commandBody.toLowerCase();
      
      if (commandBodyLower.startsWith("config ")) {
        handleConfigCommand(group_id, commandBody, settings);
      } else {
        // Triggers if the user types just the prefix, a bad command, or explicitly asks for help
        sendHelpMenu(settings);
      }
      
      return ContentService.createTextOutput(""); 
    }
    
    // 3. FAST PATH REPEATER LOGIC
    let shouldRepeat = false;
    let cleanMessage = messageText;
    
    if (settings.triggerPrefix === "") {
      if (!messageText.startsWith('@')) {
        shouldRepeat = true;
      }
    } else if (messageText.startsWith(settings.triggerPrefix)) {
      shouldRepeat = true;
      cleanMessage = messageText.substring(settings.triggerPrefix.length).trim();
    }
    
    // 4. PREPARE AND EXECUTE PAYLOAD ROUTING
    if (shouldRepeat && cleanMessage.length > 0) {
      // Append custom prompt on its own line if one is configured
      if (settings.customPrompt && settings.customPrompt !== "") {
        cleanMessage += "\n" + settings.customPrompt;
      }
      sendNewMessageAsUser(`${COPILOT_NICKNAME_FOR_MENTION} ${cleanMessage}`, group_id);
    }
    
  } catch (error) {
    Logger.log("Critical path processing error: " + error.message);
  }
  
  return ContentService.createTextOutput("");
}

function getGroupSettings(groupId) {
  try {
    const rawData = PropertiesService.getScriptProperties().getProperty(`SETTINGS_GROUP_${groupId}`);
    if (!rawData) return DEFAULT_SETTINGS;
    return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(rawData));
  } catch(e) {
    return DEFAULT_SETTINGS;
  }
}

function saveGroupSettings(groupId, settingsObj) {
  PropertiesService.getScriptProperties().setProperty(`SETTINGS_GROUP_${groupId}`, JSON.stringify(settingsObj));
}

function handleConfigCommand(groupId, commandBodyCasePreserved, currentSettings) {
  const args = commandBodyCasePreserved.substring(7).trim(); // Slices out 'config '
  const firstSpaceIndex = args.indexOf(" ");
  
  let key = firstSpaceIndex === -1 ? args.toLowerCase() : args.substring(0, firstSpaceIndex).toLowerCase();
  let value = firstSpaceIndex === -1 ? "" : args.substring(firstSpaceIndex + 1).trim();
  
  let successMessage = "";
  let updated = true;
  
  switch(key) {
    case "help":
      sendHelpMenu(currentSettings);
      return; // Handled separately, exit out early
      
    case "prompt":
      currentSettings.customPrompt = value;
      successMessage = value === "" ? "Custom prompt cleared." : `Custom prompt updated to: "${value}"`;
      break;
      
    case "admin_prefix":
      if (value.length === 1) {
        currentSettings.adminPrefix = value;
        successMessage = `Admin config prefix changed to: ${value}`;
      } else {
        successMessage = "Error: Prefix must be exactly 1 character.";
        updated = false;
      }
      break;
      
    case "trigger_prefix":
      if (value.toLowerCase() === "none" || value.toLowerCase() === "clear" || value === "") {
        currentSettings.triggerPrefix = "";
        successMessage = "Trigger prefix cleared. Repeating all normal group messages.";
      } else if (value.length === 1) {
        currentSettings.triggerPrefix = value;
        successMessage = `Trigger prefix set to: "${value}"`;
      } else {
        successMessage = "Error: Prefix must be exactly 1 character.";
        updated = false;
      }
      break;
      
    case "bot_id":
      currentSettings.botId = value;
      successMessage = `Group Bot ID linked successfully.`;
      break;
      
    default:
      // If the setting option itself is invalid, trigger the help menu response
      sendHelpMenu(currentSettings, `Unknown setting "${key}".\n\n`);
      return;
  }
  
  if (updated) saveGroupSettings(groupId, currentSettings);
  
  if (currentSettings.botId) {
    dispatchBotPost(currentSettings.botId, successMessage);
  }
}

/**
 * Sends a structured menu outlining available functionality via the linked bot ID.
 */
function sendHelpMenu(settings, errorPrefix) {
  if (!settings.botId) {
    Logger.log("Help menu requested but no Bot ID is linked for this group.");
    return;
  }
  
  const prefix = settings.adminPrefix;
  const errMsg = errorPrefix || "";
  
  const helpText = errMsg + 
    `🤖 Copilot Repeater Config Menu\n` +
    `==============================\n` +
    `Available Commands:\n\n` +
    `• ${prefix}config bot_id [id]\n` +
    `  Links the GroupMe bot response profile.\n\n` +
    `• ${prefix}config prompt [text]\n` +
    `  Appends custom instructions to a new line on every prompt.\n\n` +
    `• ${prefix}config trigger_prefix [char]\n` +
    `  Only repeats messages starting with [char]. Use "clear" to reset.\n\n` +
    `• ${prefix}config admin_prefix [char]\n` +
    `  Changes this configuration symbol.\n\n` +
    `• ${prefix}help\n` +
    `  Displays this menu.`;

  dispatchBotPost(settings.botId, helpText);
}

function dispatchBotPost(botId, text) {
  UrlFetchApp.fetch("https://api.groupme.com/v3/bots/post", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ bot_id: botId, text: text }),
    muteHttpExceptions: true
  });
}

function sendNewMessageAsUser(textToSend, groupId) {
  const userToken = PropertiesService.getScriptProperties().getProperty("GROUPME_USER_TOKEN");
  if (!userToken) return;
  
  const payload = { 
    message: { 
      source_guid: Utilities.getUuid(), 
      text: textToSend, 
      attachments: [{ type: "mentions", user_ids: [ACTUAL_COPILOT_USER_ID], loci: [[0, COPILOT_NICKNAME_FOR_MENTION.length]] }]
    } 
  };
  
  UrlFetchApp.fetch(`https://api.groupme.com/v3/groups/${groupId}/messages?token=${userToken}`, { 
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true 
  });
}