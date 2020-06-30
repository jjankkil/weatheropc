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

const utils = require("./weather-utils");

const fs = require("fs");
const options = JSON.parse(fs.readFileSync("config.json"));

const stationDataUrl = "https://tie.digitraffic.fi/api/v1/metadata/weather-stations/";
const weatherDataUrl = "https://tie.digitraffic.fi/api/v1/data/weather-data/";
const pollingInterval_s = 180;
string: language = "fi";

const fullWeatherData = { };
const partialWeatherData = { };

const unirest = require("unirest");
async function getRoadWeather(stationId) {
    const result = await new Promise((resolve) => {
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
    if (sensor === undefined)
        sensor = { name: undefined };
    return sensor;
}

function extractUsefulRoadData(data, stationName) {
    const stationData = data.weatherStations[0];
    const values = stationData.sensorValues;
    
    const rainSensor = findSensorByName(values, "SADE");
    var weatherDescription = rainSensor.sensorValue > 0.0
        ? rainSensor.sensorValueDescriptionFi + " sade"
        : rainSensor.sensorValueDescriptionFi;

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
        presentWeather:         weatherDescription
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
})(options.weatherStations);

async function update_road_data(stationId, stationName) {

    try {
        const data  = await getRoadWeather(stationId);

        partialWeatherData[stationId] = extractUsefulRoadData(data, stationName);
        console.log(`station ${stationId}: `, partialWeatherData[stationId]);

        fullWeatherData[stationId] = data;
        //console.log(`station ${stationId}: `, fullWeatherData[stationId]);

        return data;
    }
    catch(err) {
        console.log("error, station=", stationId , err);
        return ;
    }
}

async function update_data() {
    
    require('log-timestamp')(() => { 
        let date = new Date();
        const datePart =  
            `${date.getYear() + 1900}-` + 
            `${((date.getMonth() + 1) < 10 ? '0' : '') + (date.getMonth() + 1)}-` + 
            `${(date.getDate() < 10 ? '0' : '') + date.getDate()}`;
        const timePart = 
            `${date.getHours()}:` + 
            `${(date.getMinutes() < 10 ? '0' : '') + date.getMinutes()}:` + 
            `${(date.getSeconds() < 10 ? '0' : '') + date.getSeconds()}.` + 
            `${(date.getMilliseconds() < 100 ? '0' : '') + (date.getMilliseconds() < 10 ? '0' : '') + date.getMilliseconds()}`;
    return `[${datePart} ${timePart}]`; 
    });

    //  const station = next_station();
    //  console.log("updating station", station.id);
    //  await update_road_data(station);

    for (let station of options.weatherStations) {
        currStation = partialWeatherData[station.id];
        prevObservationTime = (typeof currStation !== 'undefined')
            ? currStation["observationTime"]
            : undefined;

        console.log(`getting station ${station.id} data (${station.names[language]})`);
        const data = await update_road_data(station.id, station.names[language]);

        // console.log(`${station.id} PrevObsTime:`, prevObservationTime);
        // console.log(`${station.id} CurrObsTime:`, currStation["observationTime"]);
        // console.log(typeof prevObservationTime !== 'undefined');
        // console.log(prevObservationTime != currStation["observationTime"]);
        // if (prevObservationTime !== undefined)
        //     console.log(prevObservationTime.getTime() != currStation["observationTime"].getTime());

        try  {
            currStation = partialWeatherData[station.id];
            if (typeof prevObservationTime !== 'undefined' &&
                prevObservationTime.getTime() != currStation["observationTime"].getTime() &&
                options.outputFile.isEnabled ) {

                var date = new Date();
                var year  = date.getYear() + 1900;
                var month = ((date.getMonth() + 1) < 10 ? '0' : '') + (date.getMonth() + 1);
                var fileName = `${options.outputFile.filePath}RoadWeatherData_${station.id}_${year}${month}.json`;
                console.log(`updating output file '${fileName}' for station ${station.id}`);
                fs.writeFileSync(fileName, JSON.stringify(data) + "\n", {flag: "a"});
            }
        }
        catch(err) {
            console.error(err);
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
    const fullDataRoot  = namespace.addFolder(objectsFolder,{ browseName: "AllWeatherData"});
    const dataRoot  = namespace.addFolder(objectsFolder,{ browseName: "WeatherData"});
    
    // todo: add weather station metadata

    // // add full weather station data
    // for (let station of weatherStations.stations) {
    //     const stationName  =  station.names[language];
    //     const stationNode = namespace.addFolder(dataRoot,{ browseName: station.id + ", " + stationName });

    //     namespace.addVariable({
    //         componentOf: stationNode,
    //         browseName: "DataUpdatedTime",
    //         nodeId: `s=${station.id}-DataUpdatedTime`,
    //         dataType: "DateTime",
    //         value: {  get: function () { 
    //             //const value = fullWeatherData["dataUpdatedTime"];
    //             return new opcua.Variant({ type: opcua.DataType.DateTime, value: fullWeatherData["dataUpdatedTime"] });
    //         } },
    //     });

    //     idx = 0;
    //     for (let sensor of fullWeatherData.weatherStations[0].sensorValues) {
    //         addSensorData(namespace, idx++, sensor);
    //     }
    // }

    // add partial weather station data
    for (let station of options.weatherStations) {
        const stationName  =  station.names[language];
        const stationNode = namespace.addFolder(dataRoot,{ browseName: station.id + ", " + stationName });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "ObservationTime",
            nodeId: `s=${station.id}-ObservationTime`,
            dataType: "DateTime",
            value: {  get: function () { return extractPartialDataValue(opcua.DataType.DateTime, station.id,"observationTime"); } },
        });
        
        namespace.addVariable({
            componentOf: stationNode,
            browseName: "Temperature",
            nodeId: `s=${station.id}-Temperature`,
            dataType: "Double",
            value: {  get: function () { return extractPartialDataValue(opcua.DataType.Double, station.id,"temperature"); } },
            //unit:  {  get: function () { return extract_road_value(opcua.DataType.Double, station.id,"temperatureUnit"); } }
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "TemperatureChange",
            nodeId: `s=${station.id}-TemperatureChange`,
            dataType: "Double",
            value: {  get: function () { return extractPartialDataValue(opcua.DataType.Double, station.id,"temperatureChange"); } },
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "WindSpeedAvg",
            nodeId: `s=${station.id}-WindSpeedAvg`,
            dataType: "Double",
            value: {  get: function () { return extractPartialDataValue(opcua.DataType.Double, station.id,"windSpeedAvg"); } },
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "WindDirection",
            nodeId: `s=${station.id}-WindDirection`,
            dataType: "Double",
            value: {  get: function () { return extractPartialDataValue(opcua.DataType.Double, station.id,"windDirection"); } },
        });

        // namespace.addVariable({
        //     componentOf: stationNode,
        //     browseName: "WindDirectionText",
        //     nodeId: `s=${station.id}-WindDirectionText`,
        //     dataType: "String",
        //     value: {  get: function () { 
        //         tmp = extractPartialDataValue(opcua.DataType.Double, station.id,"windDirection");
        //         const value = utils.WindDirectionAsText(tmp, language); 
        //         return new opcua.Variant( { type: opcua.DataType.String , value: 'XX' } );
        //     }},
        // });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "Humidity",
            nodeId: `s=${station.id}-Humidity`,
            dataType: "Double",
            value: {  get: function () { return extractPartialDataValue(opcua.DataType.Double, station.id,"humidity"); } },
        });

        namespace.addVariable({
            componentOf: stationNode,
            browseName: "PresentWeather",
            nodeId: `s=${station.id}-PresentWeather`,
            dataType: "String",
            value: {  get: function () { return extractPartialDataValue(opcua.DataType.String, station.id,"presentWeather"); } },
        });

    }
}

// function addSensorData(namespace, idx, sensor) {
//     namespace.addVariable({
//         componentOf: stationNode,
//         browseName: "id",
//         nodeId: `s=${station.id}-${idx}-id`,
//         dataType: "Int16",
//         value: {  get: function () { 
//             //const value = fullWeatherData["dataUpdatedTime"];
//             return new opcua.Variant({ type: opcua.DataType.Int16, value: sensor["id"] });
//         } },
//     });
// }

function extractPartialDataValue(dataType, stationId, property) {
    const station = partialWeatherData[stationId];
    if (!station) {
        return opcua.StatusCodes.BadDataUnavailable
    }
    const value = station[property];
    return new opcua.Variant({dataType, value: value });
}

(async () => {

    try {

        if (options.opcUaServer.isEnabled) {
            const server = new opcua.OPCUAServer({
                port: 4334, // the port of the listening socket of the servery
                buildInfo: {
                productName: "RoadWeather",
                buildNumber: "1",
                buildDate: new Date(2020,6,25),
                }
            });

            await server.initialize();
            construct_my_address_space(server);
            await server.start();
            
            console.log("Server is now listening ... ( press CTRL+C to stop)");
            console.log("port ", server.endpoints[0].port);
            const endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
            console.log(" the primary server endpoint url is ", endpointUrl );
        }
      
    }
    catch(err) {
       console.log("Error = ",err);
    }
})();
