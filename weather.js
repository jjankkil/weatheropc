/*global require,console,setInterval */
Error.stackTraceLimit = Infinity;

/*global require,setInterval,console */
const cities = [
    'Rovaniemi', 
    'Oulu', 
    'Helsinki'
    //'London', 'Paris','New York','Moscow','Ho chi min','Benjing','Reykjavik' ,'Nouakchott','Ushuaia' ,'Longyearbyen'
];


const fs = require("fs");
const key = fs.readFileSync("openweathermap.key");
const roadWeatherStations = JSON.parse(fs.readFileSync("stations.json"));
roadWeatherUrl = "https://tie.digitraffic.fi/api/v1/data/weather-data/";
roadWeatherAge_s = 60;

const unirest = require("unirest");
async function getCityWeather(city) {

    const result = await new Promise((resolve) => {
        unirest.get(
            "http://api.openweathermap.org/data/2.5/weather?"
            + `&q=${city}`
            + `&APPID=${key}`
        )
        .end(
            (response) => resolve(response)
        );
    });
    if (result.status !== 200) {
        console.log("ERROR: ", result.status, " ", result.value);
        throw new Error("API error");
    }
    //console.log(result);
    return result.body;
}


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

function extractUsefulData(data) {
    return  {
        city:               data.city,
        date:               new Date(),
        observation_time:   unixEpoqToDate(data.dt),
        temperature:        data.main.temp,
        humidity:           data.main.humidity,
        pressure:           data.main.pressure,
        weather:            data.weather[0].main
    };
}

function extractUsefulRoadData(data, stationName) {
    const stationData = data.weatherStations[0];
    const values = stationData.sensorValues;
    
    return  {
        id:                 stationData.id,
        name:               stationName,
        date:               new Date(),
        observation_time:   stationData.measuredTime,
        temperature:        values[0].sensorValue,
        temperatureUnit:    values[0].sensorUnit,
        humidity:           values[14].sensorValue,
        humidityUnit:       values[14].sensorUnit,
        //pressure:           data.main.pressure,
        weather:            values[15].sensorValueDescriptionFi
    };
}

const city_data_map = { };
const road_data_map = { };

// a infinite round-robin iterator over the city array
const next_city  = ((arr) => {
   let counter = arr.length;
   return function() {
      counter += 1;
      if (counter>=arr.length) {
        counter = 0;
      }
      return arr[counter];
   };
})(cities);

async function update_city_data(city) {

    try {
        const data  = await getCityWeather(city);
        city_data_map[city] = extractUsefulData(data);
    }
    catch(err) {
        console.log("error city",city , err);
        return ;
    }
}

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

// make a API call every 10 seconds
const interval = 10 * 1000;
setInterval(async () => {
     const city = next_city();
     console.log("updating city =",city);
     await update_city_data(city);

     roadWeatherAge_s += 10;
     if (roadWeatherAge_s >= 60) {
        for (let station of roadWeatherStations.stations) {
            console.log("updating station ", station.id);
            await update_road_data(station.id, station.names["fi"]);
        }
        roadWeatherAge_s = 0;
     }

}, interval);

const opcua = require("node-opcua");


function construct_my_address_space(server) {
    // declare some folders
    const addressSpace = server.engine.addressSpace;
    const namespace = addressSpace.getOwnNamespace();
    const objectsFolder = addressSpace.rootFolder.objects;

    const citiesNode  = namespace.addFolder(objectsFolder,{ browseName: "Cities"});
    const roadStationsRootNode  = namespace.addFolder(objectsFolder,{ browseName: "RoadStations"});

    for (let city_name of cities) {
        // declare the city node
        const cityNode = namespace.addFolder(citiesNode,{ browseName: city_name });
        namespace.addVariable({
            componentOf: cityNode,
            browseName: "Temperature",
            nodeId: `s=${city_name}-Temperature`,
            dataType: "Double",
            value: {  get: function () { return extract_value(opcua.DataType.Double, city_name,"temperature"); } }
        });
        namespace.addVariable({
            componentOf: cityNode,
            nodeId: `s=${city_name}-Humidity`,
            browseName: "Humidity",
            dataType: "Double",
            value: {  get: function () { return extract_value(opcua.DataType.Double,city_name,"humidity"); } }
        });
        namespace.addVariable({
            componentOf: cityNode,
            nodeId: `s=${city_name}-Pressure`,
            browseName: "Pressure",
            dataType: "Double",
            value: {  get: function () { return extract_value(opcua.DataType.Double,city_name,"pressure"); } }
        });
        namespace.addVariable({
            componentOf: cityNode,
            nodeId: `s=${city_name}-Weather`,
            browseName: "Weather",
            dataType: "String",
            value: {  get: function () { return extract_value(opcua.DataType.String,city_name,"weather"); } }
        });
    }

    for (let station of roadWeatherStations.stations) {
        const stationName  =  station.names["fi"];
        const stationNode = namespace.addFolder(roadStationsRootNode,{ browseName: station.id + ", " + stationName });
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

function extract_value(dataType,city_name,property) {
    const city = city_data_map[city_name];
    if (!city) {
        return opcua.StatusCodes.BadDataUnavailable
    }

    const value = city[property];
    return new opcua.Variant({dataType, value: value });
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
