/*todo:
- on startup update weatherDataMap from json data file 
- add station metadata to OPC UA address space on startup, update once an hour or so
- take station names from station metadata instead of configuration file
- add all station data to OPC UA address space instead of just selected data:
  - first just copy the json structure to UPC UA address space 'as-is'
  - later improve unit handling, e.g. add custom OPC UA data types
- make this a module or something...
*/

/*global require,console,setInterval */
Error.stackTraceLimit = Infinity;

const fs = require("fs");
const weatherStations = JSON.parse(fs.readFileSync("stations.json"));

const stationDataUrl = "https://tie.digitraffic.fi/api/v1/metadata/weather-stations/";
const weatherDataUrl = "https://tie.digitraffic.fi/api/v1/data/weather-data/";
const pollingInterval_s = 180;
string: language = "fi";
const weatherDataMap = { };

const unirest = require("unirest");
async function getRoadWeather(stationId) {
    const result = await new Promise((resolve) => {
        // console.log("getting data from ", 
        // "https://tie.digitraffic.fi/api/v1/data/weather-data/"
        // + `${stationId}`);

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

function strToDateTime(str) {
    return unixEpoqToDate(Date.parse(str)/1000);
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
        id:                     stationData.id,
        name:                   stationName,
        currentTime:            new Date(),
        observationTime:        strToDateTime(stationData.measuredTime),
        temperature:            findSensorByName(values, "ILMA").sensorValue,
        temperatureUnit:        findSensorByName(values, "ILMA").sensorUnit,
        temperatureChange:      findSensorByName(values, "ILMA_DERIVAATTA").sensorValue,
        temperatureChangeUnit:  findSensorByName(values, "ILMA_DERIVAATTA").sensorUnit,
        windSpeedAvg:           findSensorByName(values, "KESKITUULI").sensorValue,
        windSpeedAvgUnit:       findSensorByName(values, "KESKITUULI").sensorUnit,
        windDirection:          findSensorByName(values, "TUULENSUUNTA").sensorValue,
        windDirectionUnit:      findSensorByName(values, "TUULENSUUNTA").sensorUnit,
        humidity:               findSensorByName(values, "ILMAN_KOSTEUS").sensorValue,
        humidityUnit:           findSensorByName(values, "ILMAN_KOSTEUS").sensorUnit,
        presentWeather:         findSensorByName(values, "SADE").sensorValueDescriptionFi
    };
}

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
        weatherDataMap[stationId] = extractUsefulRoadData(data, stationName);
        console.log(`station ${stationId}: `, weatherDataMap[stationId]);
        return data;
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

    for (let station of weatherStations.stations) {
        currStation = weatherDataMap[station.id];
        prevObservationTime = (typeof currStation !== 'undefined')
            ? currStation["observationTime"]
            : undefined;

        console.log(`updating station ${station.id}:`, station.names[language]);
        const data = await update_road_data(station.id, station.names[language]);

        // console.log(`${station.id} PrevObsTime:`, prevObservationTime);
        // console.log(`${station.id} CurrObsTime:`, currStation["observationTime"]);
        // console.log(typeof prevObservationTime !== 'undefined');
        // console.log(prevObservationTime != currStation["observationTime"]);
        // if (prevObservationTime !== undefined)
        //     console.log(prevObservationTime.getTime() != currStation["observationTime"].getTime());

        try  {
            currStation = weatherDataMap[station.id];
            if (typeof prevObservationTime !== 'undefined' &&
                prevObservationTime.getTime() != currStation["observationTime"].getTime()) {
                console.log(`updating output file for station ${station.id}`);
                fs.writeFileSync(`log/${station.id}_data.json`, JSON.stringify(data) + "\n", {flag: "a"});
            }
        }
        catch(err) {
        }
    }

}

//initial data update
update_data();

// make a API call every 10 seconds
setInterval(update_data, pollingInterval_s * 1000);

const opcua = require("node-opcua");
function construct_my_address_space(server) {
    // declare some folders
    const addressSpace = server.engine.addressSpace;
    const namespace = addressSpace.getOwnNamespace();
    const objectsFolder = addressSpace.rootFolder.objects;
    
    const metaDataRoot  = namespace.addFolder(objectsFolder,{ browseName: "WeatherStations"});
    const dataRoot  = namespace.addFolder(objectsFolder,{ browseName: "WeatherData"});
    
    // todo: add weather station metadata

    // add weather station data
    for (let station of weatherStations.stations) {
        const stationName  =  station.names[language];
        const stationNode = namespace.addFolder(dataRoot,{ browseName: station.id + ", " + stationName });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "ObservationTime",
            nodeId: `s=${station.id}-ObservationTime`,
            dataType: "DateTime",
            value: {  get: function () { return extract_road_value(opcua.DataType.DateTime, station.id,"observationTime"); } },
        });
        
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
            browseName: "TemperatureChange",
            nodeId: `s=${station.id}-TemperatureChange`,
            dataType: "Double",
            value: {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"temperatureChange"); } },
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "WindSpeedAvg",
            nodeId: `s=${station.id}-WindSpeedAvg`,
            dataType: "Double",
            value: {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"windSpeedAvg"); } },
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "WindDirection",
            nodeId: `s=${station.id}-WindDirection`,
            dataType: "Double",
            value: {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"windDirection"); } },
        });

        // namespace.addVariable({
        //     componentOf: stationNode,
        //     browseName: "WindDirectionText",
        //     nodeId: `s=${station.id}-WindDirectionText`,
        //     dataType: "String",
        //     value: {  get: function () { 
        //         tmp = extract_road_value(opcua.DataType.Double, station.id,"windDirection");
        //         const value = WindDirectionAsText(tmp, language); 
        //         return new opcua.Variant( { opcua.DataType.String , value: value } );
        //     }},
        // });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "Humidity",
            nodeId: `s=${station.id}-Humidity`,
            dataType: "Double",
            value: {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"humidity"); } },
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "PresentWeather",
            nodeId: `s=${station.id}-PresentWeather`,
            dataType: "String",
            value: {  get: function () { return extract_road_value(opcua.DataType.String, station.id,"presentWeather"); } },
        });

    }
}

function WindDirectionAsText(degrees, language) {
    // remove "bias"
    while(degrees > 360)
        degrees -= 360;

    let result = '';
    if ( (45 - 22.5) <= degrees && degrees < (45 + 22.5) )
    {
        result = language == "fi"
        ? 'koillisesta'
        : 'NE';
    }
    else if ( (90 - 22.5) < degrees && degrees < (90 + 22.5) )
    {
      result = language == "fi"
        ? 'idästä'
        : 'E';
    }
    else if ( (135 - 22.5) < degrees && degrees < (135 + 22.5) )
    {
      result = language == "fi"
        ? 'kaakosta'
        : 'SE';
    }
    else if ( (180 - 22.5) <= degrees && degrees < (180 + 22.5) )
    {
      result = (language == "fi")
        ? 'etelästä'
        : 'S';
    }
    else if ( (225 - 22.5) <= degrees && degrees < (225 + 22.5) )
    {
      result = (language == "fi")
        ? 'lounaasta'
        : 'SW';
    }
    else if ( (270 - 22.5) <= degrees && degrees < (270 + 22.5) )
    {
      result = (language == "fi")
        ? 'lännestä'
        : 'W';
    }
    else if ( (315 - 22.5) <= degrees && degrees < (315 + 22.5) )
    {
      result = (language == "fi")
        ? 'luoteesta'
        : 'NW';
    }
    else
    {
      result = (language == "fi")
        ? 'pohjoisesta'
        : 'N';
    }

    return result;
}

function extract_road_value(dataType, stationId, property) {
    const station = weatherDataMap[stationId];
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
           productName: "RoadWeather",
           buildNumber: "1",
           buildDate: new Date(2020,6,25),
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
