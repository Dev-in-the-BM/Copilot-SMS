// ========================================================================
//      GroupMe Bot: Simplified Message Repeater for Copilot
// ========================================================================

// --- CONFIGURATION ---
const CONFIG = {
  // Paste your GroupMe Access Token here (from dev.groupme.com/applications)
  GROUPME_USER_TOKEN: "YOUR_GROUPME_USER_TOKEN"
};

// Constant ID for the target bot/user to avoid loops
const ACTUAL_COPILOT_USER_ID = "128934125";
const COPILOT_NICKNAME_FOR_MENTION = "@Copilot";

/**
 * Handles inbound webhook requests from the GroupMe Bot Callback.
 */
function doPost(e) {
  try {
    // Parse the incoming message data from GroupMe
    const postData = JSON.parse(e.postData.contents);
    const { group_id, user_id, text, sender_type } = postData;
    
    // Ensure essential tracking data exists
    if (!group_id || !user_id) {
      return ContentService.createTextOutput("");
    }
    
    const messageText = (text || "").trim();
    
    // Core Logic: Repeat the message if:
    // 1. The sender is a regular user (not a bot)
    // 2. The sender is not Copilot itself
    // 3. The message has text content
    // 4. The message does not already start with an '@' symbol (prevents loops)
    if (
      sender_type === 'user' && 
      user_id !== ACTUAL_COPILOT_USER_ID && 
      messageText && 
      !messageText.startsWith('@')
    ) {
      // Construct the repeated text with the mention prefix
      const repeatedText = `${COPILOT_NICKNAME_FOR_MENTION} ${messageText}`;
      sendNewMessageAsUser(repeatedText, group_id);
    }
    
  } catch (error) {
    Logger.log("Error handling inbound message: " + error.message);
  }
  
  // Always return an empty 200 OK status string to GroupMe
  return ContentService.createTextOutput("");
}

/**
 * Pushes the repeated message back into the specified GroupMe channel.
 */
function sendNewMessageAsUser(textToSend, groupId) {
  // Construct a standard text mention object targeting Copilot
  const attachments = [{ 
    type: "mentions", 
    user_ids: [ACTUAL_COPILOT_USER_ID], 
    loci: [[0, COPILOT_NICKNAME_FOR_MENTION.length]] 
  }];
  
  const payload = { 
    message: { 
      source_guid: Utilities.getUuid(), 
      text: textToSend, 
      attachments: attachments 
    } 
  };
  
  const url = `https://api.groupme.com/v3/groups/${groupId}/messages?token=${CONFIG.GROUPME_USER_TOKEN}`;
  
  const options = { 
    method: "post", 
    contentType: "application/json", 
    payload: JSON.stringify(payload), 
    muteHttpExceptions: true 
  };
  
  UrlFetchApp.fetch(url, options);
}