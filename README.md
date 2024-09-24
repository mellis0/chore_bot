# Chore Assignment Bot

When I was chore manager of GT Delta Sig, I wrote this script so that I wouldn't have to be at my computer every Tuesday and Thursday at 8pm to process the chores and announce which ones still aren't done.

The Chore Manager fills in a spreadsheet with a list of chores and a bank of people that can be assigned to those chores, then the script generates a google form and sends it out on the 'chores' slack channel.

When the chore period ends at the pre-set time, the script closes the form and figures out which chores have been completed based on the form responses. Then, it sends out a list of chores that still need to be completed on slack.
