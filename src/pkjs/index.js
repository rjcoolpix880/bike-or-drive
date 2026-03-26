// Helper function for XMLHttpRequest
var xhrRequest = function (url, type, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    callback(this.responseText);
  };
  xhr.open(type, url);
  xhr.send();
};

function locationSuccess(pos) {
  var url = 'https://api.open-meteo.com/v1/forecast?' +
      'latitude=' + pos.coords.latitude +
      '&longitude=' + pos.coords.longitude +
      '&current=temperature_2m' +
      '&hourly=precipitation_probability' +
      '&temperature_unit=fahrenheit' +
      '&timezone=auto' +
      '&forecast_hours=25';

  xhrRequest(url, 'GET',
    function(responseText) {
      var json = JSON.parse(responseText);
      var hourlyTime = json.hourly && json.hourly.time ? json.hourly.time : [];
      var hourlyPrecip = json.hourly && json.hourly.precipitation_probability ? json.hourly.precipitation_probability : [];

      var threshold = 50;
      var bikeDecision = "BIKE";

      var index9 = -1;
      var index17 = -1;

      // Initialize the 24-element precip data array for Pebble (C side)
      var precipData = [];
      for(var k=0; k<24; k++) { precipData.push(0); }

      for (var j = 0; j < Math.min(25, hourlyTime.length); j++) {
        var hourStr = hourlyTime[j].slice(11, 13);
        var hourNum = parseInt(hourStr, 10);
        
        if (hourNum === 9 && index9 === -1) index9 = j;
        if (hourNum === 17 && index17 === -1) index17 = j;

        // Map into the 24-element precipData array using hour - 1 (0 to 23).
        var colIndex = hourNum - 1;
        if (colIndex < 0) colIndex = 23;

        // Store precipitation at this index.
        if (j < hourlyPrecip.length) {
            precipData[colIndex] = hourlyPrecip[j];
        }
      }

      var checkIndices = [];
      if (index9 !== -1) { checkIndices.push(index9 - 1, index9, index9 + 1); }
      if (index17 !== -1) { checkIndices.push(index17 - 1, index17, index17 + 1); }

      for (var i = 0; i < checkIndices.length; i++) {
        var idx = checkIndices[i];
        if (idx >= 0 && idx < hourlyPrecip.length) {
          if (hourlyPrecip[idx] >= threshold) {
            bikeDecision = "DRIVE";
            break;
          }
        }
      }
      
      var now = new Date();
      var h = now.getHours();
      var ampm = h >= 12 ? "p" : "a";
      h = h % 12;
      h = h ? h : 12;
      var m = now.getMinutes();
      var minStr = m < 10 ? "0" + m : m;
      
      var updateTimeStr = h + ':' + minStr + ampm + ' Today';

      var currentTemp = json.current && json.current.temperature_2m !== undefined ? Math.round(json.current.temperature_2m) : 0;

      var dictionary = {
        'DECISION': bikeDecision,
        'PRECIP_DATA': precipData,
        'UPDATE_TIME': updateTimeStr,
        'CURRENT_TEMP': currentTemp
      };

      Pebble.sendAppMessage(dictionary,
        function(e) {
          console.log('Decision and precip data sent successfully!');
        },
        function(e) {
          console.log('Error sending decision and precip data!');
        }
      );
    }
  );
}

function locationError(err) {
  console.log('Error requesting location!');
}

function getWeather() {
  navigator.geolocation.getCurrentPosition(
    locationSuccess,
    locationError,
    { timeout: 15000, maximumAge: 60000 }
  );
}

// Listen for when the watchface is opened
Pebble.addEventListener('ready',
  function(e) {
    console.log('PebbleKit JS ready!');

    // Get the initial weather
    getWeather();
  }
);

// Listen for when an AppMessage is received
Pebble.addEventListener('appmessage',
  function(e) {
    console.log('AppMessage received!');
    // Check if this is a weather refresh request
    if (e.payload['REQUEST_WEATHER']) {
      getWeather();
    }
  }
);
