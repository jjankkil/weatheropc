# weatheropc
Simple OPC UA server which fetches some data from the configured road weather stations and adds it to OPC UA address space, and also logs the data to configured JSONL files. The server uses node-OPCUA and is originally based on Node-OPCUA Weather Station example code, see http://node-opcua.github.io/tutorial/2015/07/05/weather-station.html.

This is a only small learning project, which lacks proper error handling and could use some cleanup and refactoring. Despite this, the code has been running quite reliably on my private Raspberry Pi 1B 512MB since 2020.

## preparing the project
node.js needs to be installed (e.g. sudo apt install nodejs), then:

npm install unirest

npm install node-opcua

npm install log-timestamp

## running the server
node roadweather.js

## accessing the data
Data can be browsed with an OPC UA client:
<img width="1438" height="661" alt="image" src="https://github.com/user-attachments/assets/b74984b3-0b88-467d-8db3-23664d170538" />

If configured to log data to monthly JSONL files, you can of course use any method available in your system to access the files.
