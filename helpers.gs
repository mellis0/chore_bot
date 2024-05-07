/**
 * Convert text to a JSON string and post to slack API endpoint
 */
function postTextToSlack(text, url, logOn = false) {
  var data = {
    'text': text
  };
  var options = {
    'method' : 'post',
    'contentType': 'application/json',
    'payload' : JSON.stringify(data)
  };

  // Send payload to API
  var response = UrlFetchApp.fetch(url, options);
  if (logOn) {
    Logger.log(response.getContentText());
  }
}

/**
 * Check chore form and create a string of all the Slack IDs of Brothers who haven't finished
 * their chores.
 */
function getBrothersNotFinishedChores(){
  try {
    // Get brothers who haven't done their chore
    var form = getForm("Todays Chores", "C2");
    var checkboxItem = form.getItems(FormApp.ItemType.CHECKBOX)[0];
    var checkboxResponses = getCheckboxResponses(form, checkboxItem);
    var incompleteChores = getIncompleteChores(checkboxItem, checkboxResponses);
    var incompleteChoreBrothers = incompleteChores.map((str) => str.split(" : ")[0]);

    // Get a map of brother : Slack ID
    var choreMatrix = CHORE_SPREADSHEET.getSheetByName("Brothers");
    let brotherSlackIds = combineListsToMap(
      getColumnValues(choreMatrix, "Name"), 
      getColumnValues(choreMatrix, "Slack ID")
    );

    // Look up Slack IDs for brothers who haven't completed chores
    var slackIDs = incompleteChoreBrothers
      .map(brother => brotherSlackIds.hasOwnProperty(brother) ? brotherSlackIds[brother] : null)
      .filter(slackID => slackID);

    // Create string of Slack IDs
    slackIDs = slackIDs.map(slackID => `<@${slackID}>`).join(" ");
    return slackIDs;
  } catch (error) {
    postTextToSlack(`Brother slack id processing error: ${error.message}`, CHORE_BOT_TESTING_URL);
    return ""
  }
}


// ~~~~~~~~~~~~~~ populateChores helpers ~~~~~~~~~~~~~~~~~
function writeArrayToColumn(spreadsheetObj, sheetName, firstCellLetter, firstCellNumber, arr) {
  const range = [firstCellLetter, firstCellNumber, ':', firstCellLetter, arr.length + firstCellNumber - 1].join("");
  spreadsheetObj
    .getSheetByName(sheetName)
    .getRange(range)
    .setValues(arr
      .map(elem => [elem])
    ); 
}

function shuffle(array) {
  var currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}


// ~~~~~~~~~~~~~~ spawnForm helpers ~~~~~~~~~~~~~~~~~
function copyTemplateForm(formName) {
  var destFolder = DriveApp.getFolderById(FORM_FOLDER_ID);
  var file = DriveApp.getFileById(TEMPLATE_FORM_ID).makeCopy(formName, destFolder);

  var form = FormApp.openById(file.getId());
  form.setTitle(formName);
  return form;
}

function getMatrixFromSheet(spreadsheetObj, sheetName) {
  return spreadsheetObj.getSheetByName(sheetName).getDataRange().getValues();
}

function generateCheckboxChoices(brotherNames, choreDescriptions) {
  var checkboxChoices = null;
  if (brotherNames.length < choreDescriptions.length) {
    checkboxChoices = brotherNames.map((name, i) => [name, choreDescriptions[i]].join(" : "));
  } else {
    checkboxChoices = choreDescriptions.map((desc, i) => [brotherNames[i], desc].join(" : "))
  }
  return checkboxChoices;
}


//~~~~~~~~~~~~~~ closeFormIfTime helpers ~~~~~~~~~~~~~~~~~
function readDueDate(sheetName, dateCell, hourCell) {
  var dueDate = CHORE_SPREADSHEET.getSheetByName(sheetName).getRange(dateCell).getValue();
  var hour = CHORE_SPREADSHEET.getSheetByName(sheetName).getRange(hourCell).getValue();
  dueDate.setHours(hour + 12); // have to adjust for 24h time. We assume the inputted time is PM
  return dueDate
}

function getForm(sheetName, cell) {
  var formUrl = CHORE_SPREADSHEET.getSheetByName(sheetName).getRange(cell).getValue();
  try {
    return FormApp.openByUrl(formUrl);
  } catch (err) {
    Logger.log(err);
    return null;
  }
}

// checkboxResponses is an array where each element is a response to the checkbox item.
// responses to the checkbox item are an array of strings corresponding to the options that were checked.
// hense checkboxResponses is a String[][]
function getCheckboxResponses(form, checkboxItem) {
  return form
    .getResponses()
    .map(formResponseElem => formResponseElem
      .getResponseForItem(checkboxItem)
      .getResponse()
    );
}

function getIncompleteChores(checkboxItem, checkboxResponses) {
  var completedChores = new Set();

  // add all the selected chores in the checkbox reponses to the completed chores set
  checkboxResponses
    .map(response => response
      .map(choreDescription => completedChores.add(choreDescription)
      )
    );

  var allChores = checkboxItem
    .asCheckboxItem()
    .getChoices()
    .map(choiceObj => choiceObj.getValue()); // array of strings of all chore descriptions on the form

  return allChores.filter(chore => !completedChores.has(chore));
}


// ~~~~~~~~~~~~~~~~ closePreviousStealsSheet helper ~~~~~~~~~~~~~~~~~~~~~~~
function openSheet(sheetName, cell) {
  var sheetURL = CHORE_SPREADSHEET.getSheetByName(sheetName).getRange(cell).getValue();
    try {
      return SpreadsheetApp.openByUrl(sheetURL);
    } catch (err) {
      Logger.log(err);
      return null;
    }
}

// ~~~~~~~~~~~~~~~~ Google Sheets helpers ~~~~~~~~~~~~~~~~~~~~~~~
function formatDate(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();

  if (month < 10) {
    month = ["0", month].join("");
  }
  if (day < 10) {
    day = ["0", day].join("");
  }

  return [year, '-', month, '-', day].join("");
}

function getColumnId(sheet, column_name){
  let col_values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let column_id = -1; 
  for (var i = 0; i < col_values.length; i++) {
    if (col_values[i] === column_name) { 
      column_id = i + 1; 
      break; 
    }
  }
  return column_id
}

function getColumnValues(sheet, column_name) {
  var column_vals = sheet.getRange(1, getColumnId(sheet, column_name), sheet.getLastRow(), 1);
  return column_vals.getValues().map(function(row) { return row[0]; }).slice(1);
}

function combineListsToMap(keys, values) {
  return keys.reduce((acc, curr, index) => {
    acc[curr] = values[index];
    return acc;
  }, {});
}

function getNonNullValuesFromColumn(matrix, columnIndex) {
  return matrix
    .slice(1)
    .map(row => row[columnIndex])
    .filter(s => s.trim().length > 0); 
}
