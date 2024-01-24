
// ==UserScript==
// @name     zeppbridge
// @version  1
// @include  https://user.huami.com/privacy2/*
// ==/UserScript==

const URL_ROOT='https://api-mifit.huami.com';

const APP_PLATFORM='web';
const APP_NAME='com.xiaomi.hm.health';

const HISTORY_ENDPOINT='/v1/sport/run/history.json';
const DETAIL_ENDPOINT='/v1/sport/run/detail.json';

const WORKOUT_TYPE_MAP = {
    1: "running",
    6: "walking",
    8: "treadmill_running",
    9: "cycling",
    10: "indoor_cycling",
    16: "other",
    23: "indoor_rowing",
    92: "badminton",
}

async function fetchActivities() {
    if (! document.cookie.includes('apptoken')) {
        return
    }
    const token = document.cookie.split('apptoken=')[1].split(';')[0];
    const jsonResponse = await fetch(`${URL_ROOT}/${HISTORY_ENDPOINT}`, {
        headers: { apptoken: token,
                   appPlatform: APP_PLATFORM,
                   appname: APP_NAME}});
    
    const summary = (await jsonResponse.json()).data.summary;
    var divContainer = document.createElement('div');
    divContainer.setAttribute('style', 'display: grid; grid-template-columns: auto auto auto auto auto auto auto auto;');
    document.body.appendChild(divContainer);

    summary.forEach(activity => {
        fieldDiv(divContainer, activity.trackid);
        const activityDate = new Date(parseInt(activity.trackid) * 1000);
        fieldDiv(divContainer, activityDate.toLocaleString());
        fieldDiv(divContainer, activity.city);
        const activityType =  WORKOUT_TYPE_MAP[activity.type];
        fieldDiv(divContainer, activityType);
        fieldDiv(divContainer, `${(parseInt(activity.dis)/1000).toFixed(1)} km`);
        const hour = String(Math.floor(activity.totalTimeWithMillis / 1000 / 60 / 60)).padStart(2, 0);
        const min = String(Math.floor((activity.totalTimeWithMillis / 1000 / 60) % 60)).padStart(2, 0);
        const sec = String(Math.floor((activity.totalTimeWithMillis / 1000) % 60)).padStart(2, 0);
        fieldDiv(divContainer, `${hour}:${min}:${sec}`);
        uploadButton(divContainer, activity.trackid, activity.source, activityType);
        downloadButton(divContainer, activity.trackid, activity.source, activityType);
    });
}

function fieldDiv(parent, value) {
    const myDiv = document.createElement('div');
    myDiv.setAttribute('style', 'padding: 10px');
    myDiv.innerHTML = value;
    parent.appendChild(myDiv);
}

function uploadButton(parent, trackId, source, type) {
    const myButton = document.createElement('button');
    myButton.innerHTML = 'Upload to Strava';
    myButton.onclick = function() {
        var stravaWindow = window.open('https://www.strava.com/upload/select', '_blank');
        var stravaReady = false;
        window.addEventListener('message', function(event) {
            if(event.origin == 'https://www.strava.com') {
                stravaReady = true;
            }
        });
        const waitForStrava = setInterval(async () => {
            if (!stravaReady) {
                console.log('waiting for strava');
                stravaWindow.postMessage('Hello', 'https://www.strava.com/upload/select');
            } else {
                clearInterval(waitForStrava);
                console.log('strava ready!');
                const gpxData = await generateGpx(trackId, source, type);
                stravaWindow.postMessage(gpxData, 'https://www.strava.com/upload/select');
            }
        }, 100);
    }
    parent.appendChild(myButton)
}

function downloadButton(parent, trackId, source, type) {
    const myButton = document.createElement('button');
    myButton.innerHTML = 'Download GPX';
    myButton.setAttribute('style', 'color: white')
    myButton.onclick = async function() {
        const gpxData = await generateGpx(trackId, source, type);
        download(`${trackId}.gpx`, gpxData);
    }
    parent.appendChild(myButton)
}

async function generateGpx(trackId, source, type) {
    const token = document.cookie.split('apptoken=')[1].split(';')[0];
    const jsonResponse = await fetch(`${URL_ROOT}/${DETAIL_ENDPOINT}?trackid=${trackId}&source=${source}`, {
        headers: { apptoken: token,
                   appPlatform: APP_PLATFORM,
                   appname: APP_NAME}});

    const detail = (await jsonResponse.json()).data;

    const parsedObj = parseDetail(detail, type)

    var serializer = new GPXSerializer();
    serializer.init();
    serializer.fromParsedObj(parsedObj);
    const myGPXFile = serializer.toFile();
    return myGPXFile;
}

function parseDetail(detail, type) {
    const parsedObj = {
        'trackid': detail.trackid,
        'type': type,
        'longitudes': [],
        'latitudes': [],
        'altitudes': [],
        'heartrates': [],
        'powers': [],
        'cadences': [], //TODO
        'records': 0
    };

    const longitude_latitude = detail.longitude_latitude.split(';');
    const time = detail.time.split(';');
    var longitude = 0, latitude = 0;
    longitude_latitude.forEach((lat_lon, index) => {
        const record_time = parseInt(time[index]);
        latitude += parseInt(lat_lon.split(',')[0]) / 100000000;
        longitude += parseInt(lat_lon.split(',')[1]) / 100000000;
        for(var t=0; t<record_time; t++) {
            parsedObj.latitudes.push(latitude);
            parsedObj.longitudes.push(longitude);
        }
    });

    if ('time_delta_altitude' in detail) {
        const time_delta_altitude = detail.time_delta_altitude.split(';');
        time_delta_altitude.forEach(tdaltitude => {
            const record_time = parseInt(tdaltitude.split(',')[0]);
            const altitude = parseInt(tdaltitude.split(',')[1]) / 100;
            for(var t=0; t<record_time; t++) {
                parsedObj.altitudes.push(altitude);
            }
        });
    }

    const heart_rate = detail.heart_rate.split(';');
    var hr = 0;
    heart_rate.forEach(h_r => {
        const record_time = parseInt(h_r.split(',')[0] || 1);
        hr += parseInt(h_r.split(',')[1]);
        for(var t=0; t<record_time; t++) {
            parsedObj.heartrates.push(hr);
        }
    });

    const power_meter = detail.power_meter.split(';');
    power_meter.forEach(pm => {
        const record_time = parseInt(pm.split(',')[0]);
        const power = parseInt(pm.split(',')[1]);
        for(var t=0; t<record_time; t++) {
            parsedObj.powers.push(power);
        }
    });

    parsedObj.records = parsedObj.longitudes.length || parsedObj.heartrates.length || parsedObj.powers.length;

    return parsedObj;
}

function download(filename, file) {
    var element = document.createElement('a');
    element.setAttribute('href',  URL.createObjectURL(file));
    element.setAttribute('download', filename);
  
    element.style.display = 'none';
    document.body.appendChild(element);
  
    element.click();
  
    document.body.removeChild(element);
  }
  

class GPXSerializer   {
    constructor() {
        this.doc = new Document();
        this.fileExt = 'gpx';
    }

    init() {
        this.rootNode = this.addNodeTo(this.doc, 'gpx');
        this.rootNode.setAttribute('creator', 'Amazfit T-Rex Ultra with barometer');
        this.rootNode.setAttribute('version', '1.1');
        // doesn't work, have to add manually
        // this.rootNode.setAttribute('xmlns:gpx3', 'http://www.garmin.com/xmlschemas/GpxExtensions/v3');
        // this.rootNode.setAttribute('xmlns:tpx1', 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1');
        // this.rootNode.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.topografix.com/GPX/1/1');
        // this.rootNode.setAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'xsi:schemaLocation', [
        //     'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd',
        //     'http://www.garmin.com/xmlschemas/GpxExtensions/v3 https://www8.garmin.com/xmlschemas/GpxExtensionsv3.xsd',
        //     'http://www.garmin.com/xmlschemas/TrackPointExtension/v1 https://www8.garmin.com/xmlschemas/TrackPointExtensionv1.xsd',
        // ].join(' '));
    }

    addNodeTo(parent, name, textValue=null) {
        const node = parent.appendChild(this.doc.createElement(name));
        if (textValue != null) {
            node.textContent = textValue.toString();
        }
        return node;
    }

    toFile(name) {
        const heading = `<?xml version="1.0" encoding="${this.doc.characterSet}"?>\n`;
        const xmlString = (new XMLSerializer()).serializeToString(this.doc).replace('<gpx', '<gpx ' + [
            'xmlns="http://www.topografix.com/GPX/1/1"',
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
            'xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3"',
            'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"',
            'xsi:schemaLocation="http://www.topografix.com/GPX/1/1',
                                'http://www.topografix.com/GPX/1/1/gpx.xsd',
                                'http://www.garmin.com/xmlschemas/GpxExtensions/v3',
                                'https://www8.garmin.com/xmlschemas/GpxExtensionsv3.xsd',
                                'http://www.garmin.com/xmlschemas/TrackPointExtension/v1',
                                'https://www8.garmin.com/xmlschemas/TrackPointExtensionv1.xsd"'].join(' '))
        return new File([heading + xmlString], `${name}.gpx`, {type: 'text/xml'});
    }

    fromParsedObj(parsedObj) {
        const epochStartMS = parseInt(parsedObj.trackid)*1000;
        const startDate = new Date(epochStartMS);

        const metadata = this.addNodeTo(this.rootNode, 'metadata');
        this.addNodeTo(metadata, 'time', dateToLocaleISOString(startDate));
        const trk = this.addNodeTo(this.rootNode, 'trk');
        this.addNodeTo(trk, 'name', parsedObj.trackid);
        this.addNodeTo(trk, 'type', parsedObj.type);
        const trkseg = this.addNodeTo(trk, 'trkseg');

        for (let i = 0; i < parsedObj.records; i++) {
            const point = this.addNodeTo(trkseg, 'trkpt');

            if (parsedObj.longitudes.length) {
                point.setAttribute('lat', parsedObj.latitudes[i]);
                point.setAttribute('lon', parsedObj.longitudes[i]);
            }
            if (parsedObj.altitudes.length) {
                this.addNodeTo(point, 'ele', parsedObj.altitudes[i]);
            }
            const t = new Date(epochStartMS + 1000*i);
            this.addNodeTo(point, 'time', dateToLocaleISOString(t));
            const ext = this.addNodeTo(point, 'extensions');
            if (parsedObj.powers.length) {
                // NOTE: This is non standard and only works with GoldenCheetah.
                this.addNodeTo(ext, 'power', parsedObj.powers[i]);
            }
            const tpx = this.addNodeTo(ext, 'gpxtpx:TrackPointExtension');
            this.addNodeTo(tpx, 'gpxtpx:hr', parsedObj.heartrates[i]);
            if (parsedObj.cadences.length) {
                this.addNodeTo(tpx, 'gpxtpx:cad', parsedObj.cadences[i]);
            }
        }
    }
}

function dateToLocaleISOString(date) {
    const offset=-date.getTimezoneOffset();
    const dateLocal = new Date(date.getTime() + offset*60*1000);

    return dateLocal.toISOString().substring(0, 23) + (offset < 0 ? '-' : '+') + String(Math.abs(offset)/60).padStart(2, 0) + ':' + String(offset%60).padStart(2, 0);
}

fetchActivities();