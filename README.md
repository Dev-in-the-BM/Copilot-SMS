Disclaimer:
This ReadMe is AI generated, and I didn't completely look it over.
Therefore, I can't guarantee that what's written here is completely accurate.

---

# GroupMe Copilot Message Repeater Bot

A lightweight, latency-optimized Google Apps Script designed to act as an automated, real-time bridge between a GroupMe chat and Microsoft Copilot. It instantly intercepts standard user messages, appends optional system configurations, and forwards them as an explicit mention to Copilot. 

All settings are configured securely in real-time on a per-group basis directly from the chat interface, restricting access exclusively to the developer token owner.

## Features

* **Latency-Optimized Processing Engine (Fast Path):** The architecture is built for split-second routing. It runs preliminary data validation to drop invalid payloads (such as empty text, bot messages, or images without text) before initializing properties or requesting network tasks. This short-circuit design keeps standard user chat speeds virtually unaffected by the repeater's presence.
* **Granular Per-Group Sandboxing:** The script leverages unique Group IDs provided by GroupMe webhooks to isolate configurations. Custom prompts, control triggers, and linked Bot IDs are saved independently via localized JSON strings inside Google's Script Properties. Changing settings in one chat room will never alter or pollute the behavior of another.
* **Owner-Only Security Layer:** To prevent unauthorized chat members or trolls from hijacking your configuration panel, the script locks down administrative functions. It utilizes your high-privilege `GROUPME_USER_TOKEN` to resolve your official user identity. Once identified, it stores this in a fast, in-memory variable (`CACHED_OWNER_ID`) that checks every config request instantly without introducing compounding network latency.
* **Fault-Tolerant Help Desk:** The script acts as an intelligent firewall for administrative errors. If an operator types an unrecognized setting option or explicitly calls for help, the codebase overrides standard message flow, generates a cleanly structured Markdown map of working syntaxes, and pushes it back into the room via the connected bot profile.

---

## Configuration Guide

### 1. Paste the Code into Google Apps Script
1. Open your browser and navigate to [script.google.com](https://script.google.com).
2. Create a new project or open your existing one.
3. Open the `Code.gs` file in the editor.
4. Delete any default code inside `Code.gs`, paste the entire updated script block into it, and save the project.

### 2. Script Properties Setup
The script uses Google's environment variable management to securely store your token:

1. Inside your Google Apps Script project, click on the **Project Settings** (the gear `⚙️` icon on the left sidebar).
2. Scroll down to the **Script Properties** module and click **Add script property**.
3. Configure the property with the following explicit credentials:
   * **Property Name:** `GROUPME_USER_TOKEN`
   * **Value:** Your personal GroupMe Developer Access Token (obtained via [dev.groupme.com/applications](https://dev.groupme.com/applications)).
4. Click **Save script properties**.

### 3. Live Web App Deployment
1. Click the **Deploy** button in the top right corner of the Google Apps Script editor interface and select **New deployment**.
2. Click the gear icon (`⚙️`) next to "Select type" and choose **Web app**.
3. Configure the execution criteria with these exact options:
   * **Execute as:** `Me (your-email@example.com)`
   * **Who has access:** `Anyone`
4. Click **Deploy**, follow the authorization permissions prompts, and **copy the generated Web app URL**.
5. Log into [dev.groupme.com/bots](https://dev.groupme.com/bots), create or edit your group's bot profile, and paste the Web app URL directly into the **Callback URL** field.

---

## Interactive Chat Commands

All settings are managed live inside your GroupMe chat window. These commands default to using the `!` prefix and can only be executed by the developer who owns the `GROUPME_USER_TOKEN`. Any unauthorized attempts are silently ignored.

### 1. Link Response Interface (Recommended)
Link your bot's backend instance utilizing its user-visible display name. This allows the bot to text you back directly in the chat to confirm configuration updates without exposing its private `bot_id` string:
```text
!config bot_name My Custom Bot Name