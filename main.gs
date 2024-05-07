/**
 * I created a trigger that calls this when the spreadsheet is opened. See the triggers section
 */
function createMenu() {
  SpreadsheetApp.getUi()
    .createMenu("Chore Bot")
    .addItem("Populate Day One Chores", "populateChoresDay1")
    .addItem("Populate Day Two Chores", "populateChoresDay2")
    .addItem("Spawn New Form", "spawnForm")
    .addItem("Close chore steal sheet and process chore fines", "closeStealSheetAndProcessFines")
    .addItem("[DEBUG] Clear spreadsheet triggers", "clearSpreadsheetTriggers")
    .addToUi();
}

/**
 * Populates the "Todays Chores" sheet in the chore spreadsheet with the assigned chores for the given day.
 *
 * @param {number} day - The day of the week for which to populate the chores. Should be either 1 or 2.
 */
function populateChores(day) {
  let brotherSheetMatrix = CHORE_SPREADSHEET.getSheetByName("Brothers");
  let choreMatrix = CHORE_SPREADSHEET.getSheetByName("Chore Bank");

  // Get all brothers for that day preference, shuffle their names
  let brotherNames = getColumnValues(brotherSheetMatrix, "Name");
  let brotherDayPref = getColumnValues(brotherSheetMatrix, "Day #");
  brotherNames = brotherNames.filter((_, i) => brotherDayPref[i] === day);
  brotherNames = shuffle(brotherNames);

  // Get list of today's chores
  let dayColName = (day == 1) ? "Day 1" : (day == 2) ? "Day 2" : "";
  let choreDay = getColumnValues(choreMatrix, dayColName);
  let choreDesc = getColumnValues(choreMatrix, "Chore Description");
  let manuallyAssignedChores = getColumnValues(choreMatrix, "Manually Assign");
  let todaysChores = choreDesc.filter((_, i) => choreDay[i] || manuallyAssignedChores[i]);

  // Clear and write chores to spreadsheet
  CHORE_SPREADSHEET.getSheetByName("Todays Chores").getRange("A2:B").clear();
  writeArrayToColumn(CHORE_SPREADSHEET, "Todays Chores", "A", 2, brotherNames);
  writeArrayToColumn(CHORE_SPREADSHEET, "Todays Chores", "B", 2, todaysChores);
}

function populateChoresDay1() { return populateChores(1); }
function populateChoresDay2() { return populateChores(2); }

/**
 * Creates a new Google Form for tracking chore completion.
 */
function spawnForm() {
  var dueDate = readDueDate("Todays Chores", "D2", "D3");

  // Create form
  var formName = ["CHORES DUE ", formatDate(dueDate), " @ ", dueDate.getHours() - 12, " PM"].join("");
  var form = copyTemplateForm(formName);
  
  // Get chores + brother names from chore spreadsheet
  var todaysChoresMatrix = getMatrixFromSheet(CHORE_SPREADSHEET, "Todays Chores");
  var brotherNames = getNonNullValuesFromColumn(todaysChoresMatrix, 0);
  var choreDescriptions = getNonNullValuesFromColumn(todaysChoresMatrix, 1);
  var checkboxChoices = generateCheckboxChoices(brotherNames, choreDescriptions);

  // Create check boxes for each chore
  var checkboxItem = form.getItems(FormApp.ItemType.CHECKBOX)[0].asCheckboxItem();
  checkboxItem
    .setTitle('Check off chore')
    .setChoiceValues(checkboxChoices)
    .setRequired(true);
  
  // Set trigger for form submission
  ScriptApp.newTrigger('formSubmissionTrigger')
    .forForm(form)
    .onFormSubmit()
    .create();

  // Add link to chore form to chore spreadsheet
  CHORE_SPREADSHEET.getSheetByName("Todays Chores").getRange("C2").setValue(form.getEditUrl());
}


/**
 * This notifies the #chores channel that somebody has completed their part of a compound chore
 *
 * @param {Object} e - The event object containing the form submission data.
 */
function formSubmissionTrigger(e) {
  // Get response from form
  const lastResponseItemResponses = e.response.getItemResponses();

  // Get whichever chore was just finished
  var cboxresponse = lastResponseItemResponses
      .filter(elem => elem.getItem().getType() == FormApp.ItemType.CHECKBOX)[0]
      .getResponse();

  // Filter for whether the chore was a compound chore
  var compoundChoreResponse = cboxresponse.filter(elem => elem.includes("[COMPOUND CHORE]"));
  if (compoundChoreResponse.length == 0) {
    return;
  }

  // Get the chore name and post to slack
  compoundChoreResponse.map(elem => {
    var nameRemoved = elem.split(' : ').slice(1).join(' : ');
    postTextToSlack(['"', nameRemoved, '"', ' was just completed. If you also have this chore, you\'re doing part 2'].join(''), CHORE_CHANNEL_URL);
  });
}

/**
 * Apps Script only allows 25 triggers, so allow a button to delete all triggers on forms. If this is run
 * while a form is still open, it may break formSubmissionTrigger functionality.
 * 
 * In the future, you may be able to implement a fix using FormApp.getPublishedUrl()
 */
function clearSpreadsheetTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() == "formSubmissionTrigger" && FormApp.openById(triggers[i].getTriggerSourceId()).getTitle()) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function remind(dueDate) {
  var reminderDate = new Date(dueDate.getTime());
  reminderDate.setHours(dueDate.getHours() - 2);

  var remindedAlready =  CHORE_SPREADSHEET.getSheetByName("Todays Chores").getRange("E2").getValue();
  var sentReminder = remindedAlready.trim().length > 0;

  if (!sentReminder && dueDate > new Date() && new Date() > reminderDate) {
    var slackIds = getBrothersNotFinishedChores();
    postTextToSlack(`Chores due in two hours ${slackIds}`, CHORE_CHANNEL_URL);
    CHORE_SPREADSHEET.getSheetByName("Todays Chores").getRange("E2").setValue("Yes");
  }
}

/**
 * Makes Chore Steal sheet view only and adds all chore fines chore fine master sheet
 */
function closeStealSheetAndProcessFines() {
  closePreviousStealsSheet();
  processChoreFines();
}

/**
 * Makes Chore Steal sheet view only
 */
function closePreviousStealsSheet() {
  var sheet = openSheet("Todays Chores", "F2");
  if (sheet === null) {
    return;
  }
  DriveApp.getFileById(sheet.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}

/**
 * Adds chore fines to chore fine master sheet
 */
function processChoreFines() {
  var todaysChoreStealSheet = openSheet("Todays Chores", "F2");

  if (todaysChoreStealSheet === null) {
    return;
  }

  // write finer, finee, and chore description at the bottom here
  var fineSheet = SpreadsheetApp.openById(FINES_SHEET_ID);
  var firstOpenRow = fineSheet.getLastRow() + 1;
  var finees = getMatrixFromSheet(todaysChoreStealSheet, "Finees").slice(1).map(row => row[0]);
  console.log(finees);
  writeArrayToColumn(fineSheet, "Chore steals", "A", firstOpenRow, finees);

  var stealsMatrix = getMatrixFromSheet(todaysChoreStealSheet, "Steals").slice(1).filter(row => row[1].trim().length > 0)

  var finers = stealsMatrix.map(row => row[0]);
  writeArrayToColumn(fineSheet, "Chore steals", "B", firstOpenRow, finers);

  var choreDescriptions = stealsMatrix.map(row => row[1]);
  writeArrayToColumn(fineSheet, "Chore steals", "C", firstOpenRow, choreDescriptions);

  var dateArray = [];
  var d = new Date();
  for (var i = 0; i < stealsMatrix.length; i++) {
    dateArray.push(d);
  }
  writeArrayToColumn(fineSheet, "Chore steals", "D", firstOpenRow, dateArray);

  var moneyArray = [];
  var fineAmount = 20;
  for (var j = 0; j < stealsMatrix.length; j++) {
    moneyArray.push(fineAmount);
  }
  writeArrayToColumn(fineSheet, "Chore steals", "E", firstOpenRow, moneyArray);
}

/**
 * I have a trigger that calls this function every 5 minutes
 * If the deadline has passed, then this function closes the chore form and sends out the chore steals
 */
function closeFormIfTime() {
  // if we don't have a date to compare, stop the code
  if (!(CHORE_SPREADSHEET.getSheetByName("Todays Chores").getRange("D2").getValue() instanceof Date)) {
    return; 
  }
  
  var dueDate = readDueDate("Todays Chores", "D2", "D3");
  remind(dueDate);

  // if it's not time to end chores, stop the code
  if (dueDate > new Date()) { 
    return;
  }

  var form = getForm("Todays Chores", "C2");

  // if the form is null or isn't accepting responses, then this function has already been run, so we terminate
  if (!form || !form.isAcceptingResponses()) { 
    return;
  }

  // close the form
  form.setAcceptingResponses(false); 
  
  return choreSteals(form, dueDate);
}

/**
 * Get chores that haven't been finished
 */
function choreSteals(form, dueDate) {
  var checkboxItem = form.getItems(FormApp.ItemType.CHECKBOX)[0];
  var checkboxResponses = getCheckboxResponses(form, checkboxItem);

  var incompleteChores = getIncompleteChores(checkboxItem, checkboxResponses);

  var choreStealFinees = incompleteChores.map(elem => elem.split(' : ')[0]);

  // remove people's names from the chore descriptions and replace them with numbers
  var choreStealsArray = incompleteChores
    .map((elem, i) => {
      var choreDescArr = elem.split(' : ').slice(1);
      choreDescArr.unshift(i + 1);
      return choreDescArr.join(' : ');
    });

  // then join the array into a constinuous string of text separated by 2 newlines
  var choreStealText = choreStealsArray.join('\n\n');

  postTextToSlack(choreStealText, CHORE_STEAL_CHANNEL_URL);

  var sheetName = ["Chore Steals From ", formatDate(dueDate), " Chores"].join("");

  spawnNewStealsSheet(sheetName, choreStealsArray, choreStealFinees);
}


/**
 * Create a new chore steals sheet and send message to Slack
 */
function spawnNewStealsSheet(fileName, stealsArr, fineesArr) {
  var destFolder = DriveApp.getFolderById(STEAL_SHEET_FOLDER_ID);
  var file = DriveApp.getFileById(TEMPLATE_STEAL_SHEET_ID).makeCopy(fileName, destFolder);

  // id of the spreadsheet to add permission to import
  const ssId = file.getId();

  // donor or source spreadsheet id, you should get it somewhere
  const donorId = BROTHER_NAMES_SSID;

  // adding permission by fetching this url
  const url = `https://docs.google.com/spreadsheets/d/${ssId}/externaldata/addimportrangepermissions?donorDocId=${donorId}`;

  const token = ScriptApp.getOAuthToken();

  const params = {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, params);


  writeArrayToColumn(SpreadsheetApp.openById(ssId), "Steals", "B", 2, stealsArr);
  writeArrayToColumn(SpreadsheetApp.openById(ssId), "Finees", "A", 2, fineesArr);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);

  postTextToSlack(["Claim steals by typing in the number of the chore you want *and* putting your name in the ", "<", file.getUrl(), "|", "Chore Steals Sheet", ">"].join(""), CHORE_STEAL_CHANNEL_URL);

  CHORE_SPREADSHEET.getSheetByName("Todays Chores").getRange("F2").setValue(file.getUrl());
}
