//--------------------------------------------------------------------------------------------------------------------
// Repeat Extensions plugin for NotePlan
// Jonathan Clark
// v0.2.0, 3.5.2021
//--------------------------------------------------------------------------------------------------------------------

// Globals
// var todaysDate = new Date().toISOString().slice(0, 10)
var paras = []
var lineCount = 0
var doneHeaderLine = 0
var cancelledHeaderLine = 0

//------------------------------------------------------------------
// Helper functions
//------------------------------------------------------------------

// Pretty print range information
function rangeToString(r) {
  if (r == undefined) {
    return "Range is undefined!"
    return
  }

  return "location: " + r.start + ", length: " + r.length
}

// Print out all data for a paragraph (borrowed from EM)
function printParagraph(p) {
  if (p == undefined) {
    console.log("ERROR: paragraph is undefined")
    return
  }
  console.log(
    "\n\ncontent: " + p.content +
    "\n\ttype: " + p.type +
    "\n\tprefix: " + p.prefix +
    "\n\tcontentRange: " + rangeToString(p.contentRange) +
    "\n\tlineIndex: " + p.lineIndex +
    "\n\tdate: " + p.date +
    "\n\theading: " + p.heading +
    "\n\theadingRange: " + rangeToString(p.headingRange) +
    "\n\theadingLevel: " + p.headingLevel +
    "\n\tisRecurring: " + p.isRecurring +
    "\n\tindents: " + p.indents +
    "\n\tfilename: " + p.filename +
    "\n\tnoteType: " + p.noteType +
    "\n\tlinkedNoteTitles: " + p.linkedNoteTitles
  )
}

// Read in the current note in the Editor and parse to get it ready to use in later functions
function readInEditorNote() {
  paras = Editor.paragraphs // reads with zero-based indexing (in .lineIndex)
  lineCount = paras.length
  var line = ''
  var title = Editor.title
  console.log("  Read from Editor " + lineCount + " paragraphs from '" + title + "'")
  // check if the last paragraph is undefined, and if so delete it from our copy
  if (paras[lineCount] == undefined) {
    console.log("    Note: removing empty final paragaph number " + lineCount)
    lineCount--
  }
  for (var i = 0; i < lineCount; i++) {
    var p = paras[i]
    // console.log(i.toString() + "/" + p.lineIndex + ": " + p.content)
    if (p.prefix == '## ' && p.content == 'Done') { doneHeaderLine = i }
    if (p.prefix == '## ' && p.content == 'Cancelled') { cancelledHeaderLine = i }
  }
  console.log("  dHL = " + doneHeaderLine + ", cHL = " + cancelledHeaderLine)
}

// Return date part of ISO 8601 standard datetime string (YYYY-MM-DD)
function toISODateString(d) {
  return d.toISOString().slice(0, 10)
}

// Calculate an offset date
function calcOffsetDate(oldDateISO, interval) {
  // Calculate an offset date, assuming:
  // - oldDateISO is type ISO Date (i.e. YYYY-MM-DD) - NB: different from JavaScript's Date type
  // - interval is string of form nn[bdwmq], and could be negative
  // - where 'b' is weekday (i.e. Monday - Friday in English)
  // Return new date also in ISO Date format
  var oldDate = new Date(oldDateISO)
  var daysToAdd = 0
  var day = 1000 * 60 * 60 * 24 // a day in milliseconds
  var unit = interval.charAt(interval.length - 1) // get last character
  var num = Number(interval.substr(0, interval.length - 1)) // return all but last character
  // console.log("    c_o_d: old = " + oldDate + " / "  + num + " / " + unit)
  switch (unit) {
    case 'b': // week days
      // Method from Arjen at https://stackoverflow.com/questions/279296/adding-days-to-a-date-but-excluding-weekends
      // Avoids looping, and copes with negative intervals too
      currentDayOfWeek = oldDate.getUTCDay() // = day of week with Sunday = 0, ..Saturday = 6
      if (num < 0) {
        // dayOfWeek = (currentDayOfWeek - 12) % (7)
        dayOfWeek = currentDayOfWeek
      } else {
        // dayOfWeek = (currentDayOfWeek + 6) % (7) // % = modulo operator in JSON
        dayOfWeek = currentDayOfWeek
      }
      if (dayOfWeek == 6) { num-- }
      if (dayOfWeek == -6) { num++ }
      // console.log("    c_o_d b: " + currentDayOfWeek + " / " + num + " / " + dayOfWeek)
      numWeekends = Math.trunc((num + dayOfWeek) / 5)
      daysToAdd = num + (numWeekends * 2)
      break
    case 'd':
      daysToAdd = num * 1 // need *1 otherwise treated as a string for some reason
      break
    case 'w':
      daysToAdd = num * 7
      break
    case 'm':
      daysToAdd = num * 30 // on average
      break
    case 'q':
      daysToAdd = num * 91 // on average
      break
    case 'y':
      daysToAdd = num * 365 // on average
      break
    default:
      console.log("    Error in c_o_d from " + oldDate + " by " + interval)
      break
  }
  var newDate = new Date(oldDate)
  newDate.setDate(oldDate.getDate() + daysToAdd)
  var newDateFmt = toISODateString(newDate)
  // console.log("    c_o_d: add " + daysToAdd + " --> " + newDateFmt)
  return newDateFmt
}

// test the calcOffsetDate function (by visual inspection; nothing clever)
function testCOD() {
  var d = new Date("2021-05-02")
  console.log("Test cOD, starting with base date " + d)
  console.log(calcOffsetDate(d, "3d"))
  console.log(calcOffsetDate(d, "43d"))
  console.log(calcOffsetDate(d, "3w"))
  console.log(calcOffsetDate(d, "3m"))
  console.log(calcOffsetDate(d, "m"))
  console.log(calcOffsetDate(d, "3s"))
  console.log(calcOffsetDate(d, "1b"))
  console.log(calcOffsetDate(d, "2b"))
  console.log(calcOffsetDate(d, "3b"))
  console.log(calcOffsetDate(d, "4b"))
  console.log(calcOffsetDate(d, "5b"))
  console.log(calcOffsetDate(d, "6b"))
}

//------------------------------------------------------------------
// Process any completed(or cancelled) tasks with my extended @repeat(..) tags,
// and also remove the HH: MM portion of any @done(...) tasks.
async function repeats() {
  // When interval is of the form '+2w' it will duplicate the task for 2 weeks
  // after the date is was completed.
  // When interval is of the form '2w' it will duplicate the task for 2 weeks
  // after the date the task was last due.If this can't be determined,
  // then default to the first option.
  // Valid intervals are [0-9][bdwmqy].
  // To work it relies on finding @done(YYYY-MM-DD HH:MM) tags that haven't yet been
  // shortened to @done(YYYY-MM-DD).
  // It includes cancelled tasks as well; to remove a repeat entirely, remoce
  // the @repeat tag from the task in NotePlan.

  const RE_DATE = '\\d{4}-[01]\\d{1}-\\d{2}' // find dates of form YYYY-MM-DD and similar
  const RE_TIME = '[0-2]\\d{1}:[0-5]\\d{1}' // find '12:23'. NB: Not sure whether additional /(?:.(?:AM|PM))?/ can work in JS
  const RE_DUE_DATE = '\\s+>' + RE_DATE   // find ' >2021-02-23' etc.
  const RE_DUE_DATE_CAPTURE = '\\s+>(' + RE_DATE + ')' // find ' >2021-02-23' and return just date part
  const RE_DATE_TIME = RE_DATE + ' ' + RE_TIME // YYYY-MM-DD HH:MM[AM|PM]
  const RE_DONE_DATE_TIME = '@done\\(' + RE_DATE_TIME + '\\)' // find @done(...) and return date-time part
  const RE_DONE_DATE_CAPTURE = '@done\\((' + RE_DATE + ')( ' + RE_TIME + ')\\)' // find @done(...) and return date-time part
  const RE_EXTENDED_REPEAT = '@repeat\\(\\+?\\d+[bdwmqy]\\)' // find @repeat()
  const RE_EXTENDED_REPEAT_CAPTURE = '@repeat\\((.*?)\\)' // find @repeat() and return part inside brackets

  console.log("repeats:")
  readInEditorNote()
  var n = 0
  var line = ''
  var updatedLine = ''
  var completedDate = ''
  var reReturnArray = []
  var endOfActive = 0
  // Set range of paragraphs in active part of note
  endOfActive = doneHeaderLine != 0 ? doneHeaderLine : lineCount
  // Go through each line in the active part of the file
  for (n = 0; n < endOfActive; n++) {
    p = paras[n]
    line = p.content
    updatedLine = ''
    completedDate = ''
    // find lines with datetime to shorten, and capture date part of it
    // i.e. @done(YYYY-MM-DD HH:MM[AM|PM])
    // console.log("  [" + n + "] " + line)
    if (line.match(RE_DONE_DATE_TIME)) {
      // get completed date
      reReturnArray = line.match(RE_DONE_DATE_CAPTURE)
      completedDate = reReturnArray[1] // now not used
      completedTime = reReturnArray[2]
      console.log("  Found '" + completedDate + "' in " + n + ": '" + line + "' ")
      updatedLine = line.replace(completedTime, '') // couldn't get a regex to work here
      line.content = updatedLine
      // Send the update to the Editor
      await Editor.updateParagraph(p)
      console.log("    updated Paragraph " + p.lineIndex)
      
      // Test if this is one of my special extended repeats
      if (updatedLine.match(RE_EXTENDED_REPEAT)) {
        var newRepeatDate = ''
        var outline = ''
        // get repeat to apply
        reReturnArray = updatedLine.match(RE_EXTENDED_REPEAT_CAPTURE)
        var dateIntervalString = reReturnArray[1]
        console.log("    Found EXTENDED @repeat(" + dateIntervalString + ") syntax")
        if (dateIntervalString[0] == '+') {
          // New repeat date = completed date + interval
          dateIntervalString = dateIntervalString.substring(1,dateIntervalString.length)
          newRepeatDate = calcOffsetDate(completedDate, dateIntervalString)
          console.log("    Adding from completed date --> " + newRepeatDate)
          // Remove any >date
          updatedLine = updatedLine.replace(/\s+>\d{4}-[01]\d{1}-\d{2}/, '') // i.e. RE_DUE_DATE, but can't get regex to work with variables like this
        } else {
          var dueDate = ''
          // New repeat date = due date + interval
          // look for the due date(>YYYY-MM-DD)
          reReturnArray = updatedLine.match(RE_DUE_DATE_CAPTURE)
          if (reReturnArray[1] != undefined) {
            dueDate = reReturnArray[1]
            console.log(dueDate)
            // need to remove the old due date
            updatedLine = updatedLine.replace('>'+dueDate, '')
            console.log(updatedLine)
          } else {
            // but if there is no due date then treat that as today
            dueDate = completedDate
          }
          newRepeatDate = calcOffsetDate(dueDate, dateIntervalString)
          console.log("    Adding from due date --> " + newRepeatDate)
        }

        // Create new repeat line, removing the @done text
        updatedLineWithoutDone = updatedLine.replace(/@done\(.*\)/, '')
        // Remove any extra trailling whitespace
        updatedLineWithoutDone = updatedLineWithoutDone.replace(/\s+$/, '')
        outline = updatedLineWithoutDone + " >" + newRepeatDate
        console.log("    -> " + outline)
        // Insert this new line after current line
        // n += 1
        // insert_new_line_at_line(outline, n)
        // save updated copy of the note contents, as changes were made (at least to @done(...))
        await Editor.insertParagraphAfterParagraph(outline, p, "scheduled")
        console.log("    inserted new paragraph after line " + p.lineIndex)
      }
    }
  }
}
