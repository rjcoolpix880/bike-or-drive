import Poco from "commodetto/Poco";
import Location from "embedded:sensor/Location";
import Timer from "timer";

const render = new Poco(screen);

// Fonts
const smallFont = new render.Font("Gothic-Regular", 18);
const boldFont = new render.Font("Bitham-Light", 42);

// Colors
const black = render.makeColor(0, 0, 0);
const white = render.makeColor(255, 255, 255);
const green = render.makeColor(0, 170, 0);
const yellow = render.makeColor(255, 170, 0);
const red = render.makeColor(255, 0, 0);
const grey = render.makeColor(80, 80, 80);

// Weather data
let weather = null;
let latitude = null;
let longitude = null;

// Animation state
let animTimer = null;
let animProgress = 1;

function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Connection state
let isConnected = true;

function checkConnection() {
    isConnected = watch.connected.app;
    drawScreen();
}
watch.addEventListener("connected", checkConnection);
checkConnection();



// Get location from the Location sensor
let location = null;

function requestLocation() {
    if (location) return;
    location = new Location({
        onSample() {
            const sample = this.sample();
            console.log("Got location: " + sample.latitude + ", " + sample.longitude);
            this.close();
            location = null;
            fetchWeather(sample.latitude, sample.longitude);
        }
    });
}
async function fetchWeather(latitude, longitude) {
    try {
        const url = new URL("http://api.open-meteo.com/v1/forecast");
        url.search = new URLSearchParams({
            latitude,
            longitude,
            hourly: "precipitation_probability",
            timezone: "auto",
            forecast_hours: "25"
        });

        console.log("Fetching weather...");
        const response = await fetch(url);
        const data = await response.json();

        const hourlyTime = (data.hourly && data.hourly.time) ? data.hourly.time.slice(0, 25) : [];
        const hourlyPrecip = (data.hourly && data.hourly.precipitation_probability) ? data.hourly.precipitation_probability.slice(0, 25) : [];

        weather = {
            hourlyTime,
            hourlyPrecip,
            lastUpdated: new Date()
        };

        console.log("Weather forecast loaded");

        animProgress = 0;
        if (animTimer) Timer.clear(animTimer);
        animTimer = Timer.repeat(() => {
            animProgress += 0.05;
            if (animProgress >= 1) {
                animProgress = 1;
                Timer.clear(animTimer);
                animTimer = null;
            }
            drawScreen();
        }, 33);

    } catch (e) {
        console.log("Weather fetch error: " + e);
    }
}

function drawScreen() {
    render.begin();
    render.fillRectangle(black, 0, 0, render.width, render.height);

    if (!isConnected) {
        const btStr = "X";
        const btWidth = render.getTextWidth(btStr, smallFont);
        render.drawText(btStr, smallFont, red, (render.width - btWidth) / 2, 0);
    }

    if (weather && weather.hourlyPrecip && weather.hourlyPrecip.length > 0) {
        // --- Added Logic for Bike Decision ---
        const threshold = 50;
        let bikeDecision = "BIKE";

        const index9 = weather.hourlyTime.findIndex(t => parseInt(t.slice(11, 13), 10) === 9);
        const index17 = weather.hourlyTime.findIndex(t => parseInt(t.slice(11, 13), 10) === 17);

        const checkIndices = [];
        if (index9 !== -1) checkIndices.push(index9 - 1, index9, index9 + 1);
        if (index17 !== -1) checkIndices.push(index17 - 1, index17, index17 + 1);

        for (const i of checkIndices) {
            if (i >= 0 && i < weather.hourlyPrecip.length) {
                if (weather.hourlyPrecip[i] >= threshold) {
                    bikeDecision = "DRIVE";
                    break;
                }
            }
        }

        const decisionWidth = render.getTextWidth(bikeDecision, boldFont);
        render.drawText(bikeDecision, boldFont, white, (render.width - decisionWidth) / 2, 2);

        // Leave room for top text, bottom text, and horizontal axis
        const topMargin = 32;
        const bottomMargin = 42;
        const graphHeight = render.height - bottomMargin - topMargin;
        const bottomTextY = render.height - bottomMargin + 4;

        // Minimalist horizontal reference (dotted 50% threshold only)
        const y50 = topMargin + Math.floor(graphHeight * 0.50);
        for (let dx = 0; dx < render.width; dx += 4) {
            render.fillRectangle(white, dx, y50, 2, 1);
        }

        const numData = Math.min(24, weather.hourlyPrecip.length);
        const barWidth = render.width / 24;

        for (let i = 0; i < numData; i++) {
            const precip = weather.hourlyPrecip[i];
            const timeStr = weather.hourlyTime[i];
            // e.g. "2026-03-24T09:00" -> hour "9"
            const hour = parseInt(timeStr.slice(11, 13), 10);

            let colIndex = hour - 1;
            if (colIndex < 0) colIndex = 23;

            let bHeight = (precip / 100) * graphHeight;
            bHeight = Math.floor(bHeight * easeOutBack(animProgress));
            if (bHeight < 0) bHeight = 0;

            const x = Math.floor(colIndex * barWidth);
            const w = Math.floor((colIndex + 1) * barWidth) - x - 1; // 1px gap
            const y = topMargin + graphHeight - bHeight;

            if (bHeight > 0) {
                if (hour === 9 || hour === 17) {
                    render.fillRectangle(white, x, y, w, bHeight);
                } else {
                    render.fillRectangle(grey, x, y, w, bHeight);
                }
            }

            // Minimal horizontal labels at 12a, 6a, 12p, 6p
            if (hour % 6 === 0) {
                let displayH = hour % 12;
                displayH = displayH === 0 ? 12 : displayH;
                const ampm = hour < 12 ? "a" : "p";
                const labelStr = `${displayH}${ampm}`;
                const labelWidth = render.getTextWidth(labelStr, smallFont);

                // Keep label clamped to edges to prevent cut-off
                let labelX = x + Math.floor(w / 2) - Math.floor(labelWidth / 2);
                if (labelX < 0) labelX = 0;
                if (labelX + labelWidth > render.width) labelX = render.width - labelWidth;

                render.drawText(labelStr, smallFont, white, labelX, bottomTextY);
            }
        }

        // --- Current Time Dotted Vertical Line ---
        const cNow = new Date();
        const cH = cNow.getHours();
        const cM = cNow.getMinutes();
        let curCol = cH - 1;
        if (curCol < 0) curCol = 23;
        const currentLineX = Math.floor((curCol + (cM / 60)) * barWidth);
        for (let dy = topMargin; dy < topMargin + graphHeight; dy += 4) {
            render.fillRectangle(white, currentLineX, dy, 1, 2);
        }

        if (weather.lastUpdated) {
            const now = new Date();
            let h = weather.lastUpdated.getHours();
            const ampm = h >= 12 ? "p" : "a";
            h = h % 12;
            h = h ? h : 12;
            const m = weather.lastUpdated.getMinutes();
            const minStr = m < 10 ? "0" + m : m;
            const timeStr = `${h}:${minStr}${ampm}`;

            const isToday = now.getDate() === weather.lastUpdated.getDate() &&
                now.getMonth() === weather.lastUpdated.getMonth() &&
                now.getFullYear() === weather.lastUpdated.getFullYear();
            const dateStr = isToday ? "Today" : "Prev";

            const updateStr = `${timeStr} ${dateStr}`;
            const upWidth = render.getTextWidth(updateStr, smallFont);
            render.drawText(updateStr, smallFont, white, (render.width - upWidth) / 2, render.height - smallFont.height);
        }

    } else {
        const msg = "Loading...";
        const width = render.getTextWidth(msg, smallFont);
        render.drawText(msg, smallFont, white,
            (render.width - width) / 2, (render.height - smallFont.height) / 2);
    }

    render.end();
}

// Refresh weather every hour
watch.addEventListener("hourchange", requestLocation);

// Fetch immediately on startup
requestLocation();



