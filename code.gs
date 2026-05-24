// ========================================================================
//      GroupMe Bot: Latency-Optimized Multi-Group Repeater (Owner Verified)
// ========================================================================

const ACTUAL_COPILOT_USER_ID = "128934125";
const COPILOT_NICKNAME_FOR_MENTION = "@Copilot";

const DEFAULT_SETTINGS = {
  adminPrefix: "!",
  triggerPrefix: "",
  customPrompt: "",
  botId: ""
};

// Global cache variable to avoid hitting GroupMe's /users/me endpoint on every single message
var CACHED_OWNER_ID = null;

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("");
  
  try {
    const postData = JSON.parse(e.postData.contents);
    const { group_id, user_id, text, sender_type } = postData;
    
    // Drop execution immediately if sender is not a user, or if text is missing
    if (sender_type !== 'user' || user_id === ACTUAL_COPILOT_USER_ID || !text) {
      return ContentService.createTextOutput("");
    }
    
    const messageText = text.trim();
    if (messageText.length === 0) return ContentService.createTextOutput("");

    const settings = getGroupSettings(group_id);
    const messageTextLower = messageText.toLowerCase();
    const adminPrefixLower = settings.adminPrefix.toLowerCase();
    
    // 1. INTERCEPT ADMIN COMMANDS IMMEDIATELY
    if (messageTextLower.startsWith(adminPrefixLower)) {
      // SECURITY VERIFICATION: Only allow the true token owner to pass
      if (verifyMessageSenderIsOwner(user_id)) {
        const commandBody = messageText.substring(settings.adminPrefix.length).trim();
        const commandBodyLower = commandBody.toLowerCase();
        
        if (commandBodyLower.startsWith("config ")) {
          handleConfigCommand(group_id, commandBody, settings);
        } else {
          sendHelpMenu(settings);
        }
      } else {
        Logger.log(`Unauthorized config attempt blocked from User ID: ${user_id}`);
      }
      
      return ContentService.createTextOutput(""); 
    }
    
    // 2. REPEATER ACTION PATHS
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
    
    // 3. EXECUTE ROUTING
    if (shouldRepeat && cleanMessage.length > 0) {
      if (settings.customPrompt && settings.customPrompt !== "") {
        cleanMessage += "\n" + settings.customPrompt;
      }
      sendNewMessageAsUser(`${COPILOT_NICKNAME_FOR_MENTION} ${cleanMessage}`, group_id);
    }
    
  } catch (error) {
    Logger.log("Processing flow exception: " + error.message);
  }
  
  return ContentService.createTextOutput("");
}

/**
 * Validates whether the sender matching the user_id owns the provided developer token.
 */
function verifyMessageSenderIsOwner(incomingSenderId) {
  if (CACHED_OWNER_ID !== null) {
    return String(incomingSenderId) === String(CACHED_OWNER_ID);
  }
  
  const userToken = PropertiesService.getScriptProperties().getProperty("GROUPME_USER_TOKEN");
  if (!userToken) return false;
  
  try {
    const response = UrlFetchApp.fetch(`https://api.groupme.com/v3/users/me?token=${userToken}`, {
      method: "get",
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data.response && data.response.id) {
        CACHED_OWNER_ID = String(data.response.id);
        return String(incomingSenderId) === String(CACHED_OWNER_ID);
      }
    }
  } catch (err) {
    Logger.log("Error querying self identity from GroupMe: " + err.message);
  }
  
  return false;
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
      return;
      
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
      successMessage = `Group Bot ID linked successfully via direct assignment.`;
      break;
      
    case "bot_name":
      if (value === "") {
        successMessage = "Error: You must provide a bot name to query. Example: !config bot_name MyBot";
        updated = false;
        break;
      }
      
      const discoveredBotId = lookupBotIdByName(groupId, value);
      if (discoveredBotId) {
        currentSettings.botId = discoveredBotId;
        // FIX: The success message has been edited to completely hide the bot_id hash
        successMessage = `Success! Looked up and linked bot "${value}" for this chat group.`;
      } else {
        successMessage = `Error: Could not find any active bot named "${value}" configured for this specific group ID (${groupId}) inside your developer account.`;
        updated = false;
      }
      break;
      
    default:
      sendHelpMenu(currentSettings, `Unknown option "${key}".\n\n`);
      return;
  }
  
  if (updated) saveGroupSettings(groupId, currentSettings);
  
  const activeBotId = currentSettings.botId;
  if (activeBotId) {
    dispatchBotPost(activeBotId, successMessage);
  }
}

function lookupBotIdByName(groupId, targetName) {
  const userToken = PropertiesService.getScriptProperties().getProperty("GROUPME_USER_TOKEN");
  if (!userToken) return null;
  
  try {
    const response = UrlFetchApp.fetch(`https://api.groupme.com/v3/bots?token=${userToken}`, {
      method: "get",
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) return null;
    
    const data = JSON.parse(response.getContentText());
    if (!data.response) return null;
    
    for (let i = 0; i < data.response.length; i++) {
      const botObj = data.response[i];
      if (
        botObj.name && botObj.name.trim().toLowerCase() === targetName.toLowerCase() &&
        String(botObj.group_id) === String(groupId)
      ) {
        return botObj.bot_id;
      }
    }
  } catch (err) {
    Logger.log("API Query Error during Bot Name matching: " + err.message);
  }
  
  return null;
}

function sendHelpMenu(settings, errorPrefix) {
  if (!settings.botId) return;
  
  const prefix = settings.adminPrefix;
  const errMsg = errorPrefix || "";
  
  const helpText = errMsg + 
    `🤖 Copilot Repeater Config Menu\n` +
    `==============================\n` +
    `Available Commands:\n\n` +
    `• ${prefix}config bot_name [name]\n` +
    `  Finds & links the Bot ID from GroupMe using its exact name.\n\n` +
    `• ${prefix}config bot_id [id]\n` +
    `  Links the response profile directly using its hash ID.\n\n` +
    `• ${prefix}config prompt [text]\n` +
    `  Appends custom instructions onto a new line for Copilot prompts.\n\n` +
    `• ${prefix}config trigger_prefix [char]\n` +
    `  Filters traffic. Use "clear" to listen to all messages.\n\n` +
    `• ${prefix}config admin_prefix [char]\n` +
    `  Changes this configuration symbol.\n\n` +
    `• ${prefix}help\n` +
    `  Displays this text map.`;

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