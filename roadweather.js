/*global require,console,setInterval */
Error.stackTraceLimit = Infinity;

const fs = require("fs");
const weatherStations = JSON.parse(fs.readFileSync("stations.json"));

const stationDataUrl = "https://tie.digitraffic.fi/api/v1/metadata/weather-stations/";
const weatherDataUrl = "https://tie.digitraffic.fi/api/v1/data/weather-data/";
int: pollingInterval_s = 60;
string: language = "fi";

const unirest = require("unirest");
async function getRoadWeather(stationId) {
    const result = await new Promise((resolve) => {
        console.log("getting data from ", 
        "https://tie.digitraffic.fi/api/v1/data/weather-data/"
        + `${stationId}`);

        unirest.get(
            "https://tie.digitraffic.fi/api/v1/data/weather-data/"
            + `${stationId}`
        )
        .header("Accept-Encoding", "gzip")
        .end(
            (response) => resolve(response)
        );
    });
    if (result.status !== 200) {
        console.log("ERROR: ", result.status, " ", result);
        throw new Error("API error");
    }
    //console.log(result.body);
    return result.body;
}

function unixEpoqToDate(unixDate) {
    const d = new Date(0);
    d.setUTCSeconds(unixDate);
    return d;
}

function findSensorByName(sensorValueArr, name) {
    sensor = sensorValueArr.filter(data => data["name"] === name )[0];
    //console.log(sensor);
    return sensor;
}

function extractUsefulRoadData(data, stationName) {
    const stationData = data.weatherStations[0];
    const values = stationData.sensorValues;
    
    return  {
        id:                 stationData.id,
        name:               stationName,
        date:               new Date(),
        observation_time:   stationData.measuredTime,
        temperature:        findSensorByName(values, "ILMA").sensorValue,
        temperatureUnit:    findSensorByName(values, "ILMA").sensorUnit,
        humidity:           findSensorByName(values, "ILMAN_KOSTEUS").sensorValue,
        humidityUnit:       findSensorByName(values, "ILMAN_KOSTEUS").sensorUnit,
        weather:            findSensorByName(values, "SADE").sensorValueDescriptionFi
    };
}

const road_data_map = { };

// a infinite round-robin iterator over the station array
const next_station  = ((arr) => {
   let counter = arr.length;
   return function() {
      counter += 1;
      if (counter>=arr.length) {
        counter = 0;
      }
      return arr[counter];
   };
})(weatherStations);

async function update_road_data(stationId, stationName) {

    try {
        const data  = await getRoadWeather(stationId);
        road_data_map[stationId] = extractUsefulRoadData(data, stationName);
        console.log(`station ${stationId}: `, road_data_map[stationId]);
    }
    catch(err) {
        console.log("error, station=", stationId , err);
        return ;
    }
}

async function update_data() {
    //  const station = next_station();
    //  console.log("updating station", station.id);
    //  await update_road_data(station);

    //  pollingInterval_s += 10;
    //  if (pollingInterval_s >= 60) {
        for (let station of weatherStations.stations) {
            console.log(`updating station ${station.id}:`, station.names[language]);
            await update_road_data(station.id, station.names[language]);
        }
        // pollingInterval_s = 0;
    //  }
}

// make a API call every 10 seconds
const interval = 60 * 1000;
update_data();
setInterval(update_data, interval);

const opcua = require("node-opcua");
function construct_my_address_space(server) {
    // declare some folders
    const addressSpace = server.engine.addressSpace;
    const namespace = addressSpace.getOwnNamespace();
    const objectsFolder = addressSpace.rootFolder.objects;
    const rootNode  = namespace.addFolder(objectsFolder,{ browseName: "WeatherStations"});
    for (let station of weatherStations.stations) {
        const stationName  =  station.names[language];
        const stationNode = namespace.addFolder(rootNode,{ browseName: station.id + ", " + stationName });
        namespace.addVariable({
            componentOf: stationNode,
            browseName: "Temperature",
            nodeId: `s=${station.id}-Temperature`,
            dataType: "Double",
            value: {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"temperature"); } },
            //unit:  {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"temperatureUnit"); } }
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "Humidity",
            nodeId: `s=${station.id}-Humidity`,
            dataType: "Double",
            value: {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"humidity"); } },
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "Weather",
            nodeId: `s=${station.id}-Weather`,
            dataType: "String",
            value: {  get: function () { return extract_road_value(opcua.DataType.String, station.id,"weather"); } },
        });

    }
}

function extract_road_value(dataType, stationId, property) {
    const station = road_data_map[stationId];
    if (!station) {
        return opcua.StatusCodes.BadDataUnavailable
    }

    const value = station[property];
    return new opcua.Variant({dataType, value: value });
}

(async () => {

    try {
      
      const server = new opcua.OPCUAServer({
         port: 4334, // the port of the listening socket of the servery
         buildInfo: {
           productName: "WeatherStation",
           buildNumber: "7658",
           buildDate: new Date(2019,6,14),
         }
      });
      
      //console.log(roadWeatherStations);

      await server.initialize();
      
      construct_my_address_space(server);
      
      await server.start();
      
      console.log("Server is now listening ... ( press CTRL+C to stop)");
      console.log("port ", server.endpoints[0].port);
      const endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
      console.log(" the primary server endpoint url is ", endpointUrl );
      
    }
    catch(err) {
       console.log("Error = ",err);
    }
})();
