# weatheropc
Simple OPC UA server which fetches some data from the configured road weather stations and adds it to OPC UA address space. The server uses node-OPCUA and is originally based on Node-OPCUA Weather Station example code, see http://node-opcua.github.io/tutorial/2015/07/05/weather-station.html.

## preparing the project
node.js needs to be installed (e.g. sudo apt install nodejs), then:

npm install unirest [--save]

npm install node-opcua [--save]

## running the server
node roadweather.js
