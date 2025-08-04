#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

// WiFi credentials
const char* ssid = "Ergun2d4";
const char* password = "Faithful@243";

// Server configuration
const char* serverURL = "https://safezone-cow-tracker.herokuapp.com/api/esp32/data";

// Pin definitions
#define LED1_PIN 2
#define LED2_PIN 4
#define LED3_PIN 5
#define BUZZER_PIN 18
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17

// GPS configuration
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

// Cow identification
String cowId = "C001";
String farmerToken = "";

// Alarm system variables
bool insideFence = true;
unsigned long boundaryHitTime = 0;
unsigned long outsideFenceTime = 0;
bool alarm1Active = false;
bool alarm2Active = false;
bool alarm3Active = false;
bool alarmSystemActive = false;

// Timing constants (in milliseconds)
const unsigned long ALARM1_DELAY = 5000;      // 5 seconds
const unsigned long ALARM2_DELAY = 15000;     // 15 seconds
const unsigned long ALARM3_DELAY = 50000;     // 50 seconds
const unsigned long ALARM3_TIMEOUT = 60000;   // 60 seconds
const unsigned long BUZZER_DURATION = 20000;  // 20 seconds
const unsigned long BUZZER_OFF_TIME = 5000;   // 5 seconds
const unsigned long LED1_FINAL_TIME = 30000;  // 30 seconds
const unsigned long DISTANCE_THRESHOLD = 1.0; // 1 meter from fence

// Buzzer pattern variables
int buzzerCycles = 0;
unsigned long buzzerStartTime = 0;
bool buzzerState = false;
unsigned long lastBuzzerToggle = 0;

// GPS and location variables
double currentLat = 0.0;
double currentLng = 0.0;
double fenceLatCenter = 35.1234;  // Example fence center
double fenceLngCenter = 33.5678;  // Example fence center
double fenceRadius = 50.0;        // Example fence radius in meters

// Communication variables
unsigned long lastDataSend = 0;
const unsigned long DATA_SEND_INTERVAL = 10000; // Send data every 10 seconds

// Speed calculation
double lastLat = 0.0;
double lastLng = 0.0;
unsigned long lastGPSTime = 0;
double currentSpeed = 0.0;

void setup() {
    Serial.begin(115200);
    gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    
    // Initialize pins
    pinMode(LED1_PIN, OUTPUT);
    pinMode(LED2_PIN, OUTPUT);
    pinMode(LED3_PIN, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    
    // Turn off all outputs initially
    digitalWrite(LED1_PIN, LOW);
    digitalWrite(LED2_PIN, LOW);
    digitalWrite(LED3_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    
    Serial.println("SafeZone Cow Tracker Starting...");
    
    // Connect to WiFi
    connectToWiFi();
    
    Serial.println("System initialized successfully!");
    Serial.println("Cow ID: " + cowId);
}

void loop() {
    // Read GPS data
    readGPS();
    
    // Update location and fence status
    updateLocation();
    
    // Handle alarm system
    handleAlarmSystem();
    
    // Send data to server
    if (millis() - lastDataSend > DATA_SEND_INTERVAL) {
        sendDataToServer();
        lastDataSend = millis();
    }
    
    delay(100); // Small delay to prevent overwhelming the system
}

void connectToWiFi() {
    WiFi.begin(ssid, password);
    Serial.print("Connecting to WiFi");
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(1000);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi connected successfully!");
        Serial.print("IP address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println();
        Serial.println("WiFi connection failed!");
    }
}

void readGPS() {
    while (gpsSerial.available() > 0) {
        if (gps.encode(gpsSerial.read())) {
            if (gps.location.isValid()) {
                currentLat = gps.location.lat();
                currentLng = gps.location.lng();
                
                // Calculate speed if we have previous position
                if (lastLat != 0.0 && lastLng != 0.0) {
                    unsigned long timeDiff = millis() - lastGPSTime;
                    if (timeDiff > 0) {
                        double distance = calculateDistance(lastLat, lastLng, currentLat, currentLng);
                        currentSpeed = (distance / timeDiff) * 3600; // Convert to km/h
                    }
                }
                
                lastLat = currentLat;
                lastLng = currentLng;
                lastGPSTime = millis();
                
                Serial.print("GPS: ");
                Serial.print(currentLat, 6);
                Serial.print(", ");
                Serial.print(currentLng, 6);
                Serial.print(" | Speed: ");
                Serial.print(currentSpeed, 2);
                Serial.println(" km/h");
            }
        }
    }
}

void updateLocation() {
    if (currentLat != 0.0 && currentLng != 0.0) {
        double distanceFromCenter = calculateDistance(currentLat, currentLng, fenceLatCenter, fenceLngCenter);
        bool newInsideFence = distanceFromCenter <= fenceRadius;
        
        // Check if status changed
        if (newInsideFence != insideFence) {
            insideFence = newInsideFence;
            
            if (!insideFence) {
                // Just went outside fence
                boundaryHitTime = millis();
                outsideFenceTime = millis();
                alarmSystemActive = true;
                
                Serial.println("COW OUTSIDE FENCE - ALARM SYSTEM ACTIVATED");
                sendAlarmToServer("boundary_breach", "Cow has breached the fence boundary");
                
            } else {
                // Returned inside fence
                resetAlarmSystem();
                Serial.println("COW RETURNED TO FENCE - ALARM SYSTEM DEACTIVATED");
                sendAlarmToServer("returned_to_fence", "Cow has returned to safe zone");
            }
        }
        
        // Check if cow is far from boundary (1 meter rule)
        if (!insideFence && distanceFromCenter > (fenceRadius + DISTANCE_THRESHOLD)) {
            if (outsideFenceTime == 0) {
                outsideFenceTime = millis();
                Serial.println("COW IS 1+ METERS OUTSIDE FENCE");
                sendAlarmToServer("distance_breach", "Cow is more than 1 meter outside fence");
            }
        }
    }
}

void handleAlarmSystem() {
    if (!alarmSystemActive) {
        return;
    }
    
    unsigned long currentTime = millis();
    unsigned long timeOutside = currentTime - boundaryHitTime;
    
    // Alarm 1: LED1 on when hitting boundary (immediate)
    if (!alarm1Active && timeOutside >= 0) {
        alarm1Active = true;
        digitalWrite(LED1_PIN, HIGH);
        Serial.println("ALARM 1 ACTIVATED - LED1 ON");
        sendAlarmToServer("alarm1", "First alarm triggered - LED1 activated");
    }
    
    // Alarm 2: LED blinking after 15 seconds
    if (!alarm2Active && timeOutside >= ALARM2_DELAY) {
        alarm2Active = true;
        Serial.println("ALARM 2 ACTIVATED - LED BLINKING");
        sendAlarmToServer("alarm2", "Second alarm triggered - LED blinking started");
    }
    
    // Handle LED2 and LED3 blinking for Alarm 2
    if (alarm2Active && !alarm3Active) {
        static unsigned long lastLEDToggle = 0;
        static bool led2State = false;
        
        if (currentTime - lastLEDToggle >= 1000) { // Toggle every 1 second
            led2State = !led2State;
            digitalWrite(LED2_PIN, led2State ? HIGH : LOW);
            digitalWrite(LED3_PIN, led2State ? LOW : HIGH); // Opposite of LED2
            lastLEDToggle = currentTime;
        }
    }
    
    // Alarm 3: Buzzer after 50 seconds
    if (!alarm3Active && timeOutside >= ALARM3_DELAY) {
        alarm3Active = true;
        buzzerStartTime = currentTime;
        buzzerCycles = 0;
        buzzerState = true;
        digitalWrite(BUZZER_PIN, HIGH);
        lastBuzzerToggle = currentTime;
        Serial.println("ALARM 3 ACTIVATED - BUZZER STARTED");
        sendAlarmToServer("alarm3", "Third alarm triggered - buzzer activated");
    }
    
    // Handle buzzer pattern for Alarm 3
    if (alarm3Active && buzzerCycles < 3) {
        if (buzzerState && (currentTime - lastBuzzerToggle >= BUZZER_DURATION)) {
            // Turn off buzzer
            digitalWrite(BUZZER_PIN, LOW);
            buzzerState = false;
            lastBuzzerToggle = currentTime;
            Serial.println("Buzzer OFF - 5 second pause");
            
        } else if (!buzzerState && (currentTime - lastBuzzerToggle >= BUZZER_OFF_TIME)) {
            // Turn on buzzer for next cycle
            digitalWrite(BUZZER_PIN, HIGH);
            buzzerState = true;
            lastBuzzerToggle = currentTime;
            buzzerCycles++;
            Serial.println("Buzzer ON - Cycle " + String(buzzerCycles));
        }
    }
    
    // Final phase: Turn off buzzer, turn on LED1 for 30 seconds
    if (alarm3Active && buzzerCycles >= 3 && !buzzerState) {
        static bool finalPhaseStarted = false;
        static unsigned long finalPhaseStart = 0;
        
        if (!finalPhaseStarted) {
            finalPhaseStarted = true;
            finalPhaseStart = currentTime;
            digitalWrite(LED1_PIN, HIGH);
            digitalWrite(LED2_PIN, LOW);
            digitalWrite(LED3_PIN, LOW);
            Serial.println("FINAL PHASE - LED1 ON FOR 30 SECONDS");
        }
        
        if (currentTime - finalPhaseStart >= LED1_FINAL_TIME) {
            resetAlarmSystem();
            Serial.println("ALARM SEQUENCE COMPLETED - SYSTEM RESET");
        }
    }
    
    // Timeout after 60 seconds - send final alert
    if (timeOutside >= ALARM3_TIMEOUT && alarmSystemActive) {
        sendAlarmToServer("timeout_alert", "60 second alarm timeout reached");
        Serial.println("60 SECOND TIMEOUT ALERT SENT");
    }
}

void resetAlarmSystem() {
    alarmSystemActive = false;
    alarm1Active = false;
    alarm2Active = false;
    alarm3Active = false;
    buzzerCycles = 0;
    boundaryHitTime = 0;
    outsideFenceTime = 0;
    
    // Turn off all outputs
    digitalWrite(LED1_PIN, LOW);
    digitalWrite(LED2_PIN, LOW);
    digitalWrite(LED3_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    
    Serial.println("ALARM SYSTEM RESET");
}

void sendDataToServer() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi not connected - attempting reconnection");
        connectToWiFi();
        return;
    }
    
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");
    
    // Create JSON payload
    StaticJsonDocument<512> doc;
    doc["cowId"] = cowId;
    doc["gps"] = String(currentLat, 6) + "," + String(currentLng, 6);
    doc["speed"] = currentSpeed;
    doc["tag"] = getCurrentTag();
    doc["timestamp"] = millis();
    doc["insideFence"] = insideFence;
    doc["alarmActive"] = alarmSystemActive;
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("Data sent successfully. Response: " + response);
    } else {
        Serial.println("Error sending data. HTTP response code: " + String(httpResponseCode));
    }
    
    http.end();
}

void sendAlarmToServer(String alarmType, String message) {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }
    
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<512> doc;
    doc["cowId"] = cowId;
    doc["gps"] = String(currentLat, 6) + "," + String(currentLng, 6);
    doc["alarmState"] = alarmType;
    doc["message"] = message;
    doc["timestamp"] = millis();
    doc["speed"] = currentSpeed;
    doc["tag"] = getCurrentTag();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
        Serial.println("Alarm sent to server: " + alarmType);
    } else {
        Serial.println("Failed to send alarm: " + alarmType);
    }
    
    http.end();
}

String getCurrentTag() {
    if (currentSpeed > 5.0) {
        return "Running";
    } else if (currentSpeed > 1.0) {
        return "Walking";
    } else if (currentSpeed > 0.1) {
        return "Moving";
    } else {
        return "Resting";
    }
}

double calculateDistance(double lat1, double lng1, double lat2, double lng2) {
    const double R = 6371000; // Earth's radius in meters
    double dLat = (lat2 - lat1) * PI / 180.0;
    double dLng = (lng2 - lng1) * PI / 180.0;
    
    double a = sin(dLat/2) * sin(dLat/2) +
               cos(lat1 * PI / 180.0) * cos(lat2 * PI / 180.0) *
               sin(dLng/2) * sin(dLng/2);
    double c = 2 * atan2(sqrt(a), sqrt(1-a));
    
    return R * c; // Distance in meters
}

// Interrupt handler for emergency stop (optional)
void IRAM_ATTR emergencyStop() {
    resetAlarmSystem();
    Serial.println("EMERGENCY STOP ACTIVATED");
}