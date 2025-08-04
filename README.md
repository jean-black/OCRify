# SafeZone - Intelligent Cow Tracking & Farm Management System

![SafeZone Logo](public/images/safezone%20icone.png)

**Version:** 1.0.0  
**Developers:** Jean Claude & Samuel  
**Institution:** Near East University  
**Year:** 2025-2026

## Overview

SafeZone is a comprehensive cow tracking and farm management system that combines IoT technology, real-time monitoring, and intelligent alerts to ensure the safety and security of livestock. The system uses ESP32 devices attached to cow collars for GPS tracking and automated alarm systems when animals breach fence boundaries.

## Features

### 🐄 **Real-time Cow Tracking**
- GPS-based location monitoring using ESP32 devices
- Real-time position updates on interactive maps
- Speed and movement pattern analysis
- Individual cow identification and tagging

### 🚨 **Three-Level Alarm System**
- **Alarm 1:** LED indicator when cow hits fence boundary
- **Alarm 2:** Alternating LED blinking after 15 seconds outside
- **Alarm 3:** Audible buzzer system with 20-second cycles after 50 seconds

### 🗺️ **Fence Management**
- Interactive fence editing with polygon and freehand drawing tools
- Multiple farm and fence support
- Smart auto-zoom and focus features
- Drag-and-drop fence editing with save/delete functionality

### 📧 **Smart Notifications**
- Gmail integration for instant breach alerts
- Daily 24MPF (24-hour monitoring) reports
- System health notifications
- Collaborative recovery request emails

### 🤝 **Collaborative Recovery System**
- Generate ephemeral links for employee assistance
- Real-time navigation to lost cow locations
- Distance tracking and status updates
- Completion notifications for both employer and employee

### 📊 **Analytics & Reporting**
- Dashboard with alarm timeline charts
- Top breach cow analysis with circular charts
- Automatic PDF report generation
- MEGA cloud storage for data archiving

### 🔒 **Security & Authentication**
- JWT-based user authentication
- Secure password requirements (10+ characters)
- Rate limiting and request validation
- HTTPS encryption for all communications

## Technology Stack

### **Frontend**
- HTML5, CSS3, JavaScript (ES6+)
- Google Maps JavaScript API
- Chart.js for data visualization
- Responsive design with mobile support

### **Backend**
- Node.js with Express.js framework
- PostgreSQL database (Heroku Postgres)
- WebSocket for real-time communication
- RESTful API architecture

### **IoT Hardware**
- ESP32 microcontrollers
- GPS modules (TinyGPS++)
- LED indicators and buzzer systems
- WiFi connectivity for data transmission

### **External Services**
- **Gmail:** Email notifications and alerts
- **MEGA:** Cloud storage for reports and backups
- **Google Maps:** Mapping and geolocation services
- **Heroku:** Cloud hosting and deployment

## Installation & Setup

### Prerequisites
- Node.js (v18.0.0 or higher)
- PostgreSQL database
- Gmail account with app password
- MEGA cloud storage account
- Google Maps API key

### 1. Clone the Repository
```bash
git clone https://github.com/safezone/cow-tracker.git
cd safezone-cow-tracker
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_jwt_secret_key
GMAIL_USER=your_gmail_address
GMAIL_APP_PASSWORD=your_gmail_app_password
MEGA_EMAIL=your_mega_email
MEGA_PASSWORD=your_mega_password
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### 4. Database Setup
```bash
# Initialize database tables
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

### 5. Start the Application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## ESP32 Setup

### Hardware Requirements
- ESP32 development board
- GPS module (Neo-6M or similar)
- 3 LEDs (different colors recommended)
- Passive buzzer
- Resistors (220Ω for LEDs)
- Breadboard and jumper wires
- Cow collar attachment system

### Pin Configuration
```cpp
#define LED1_PIN 2      // First alarm LED
#define LED2_PIN 4      // Second alarm LED (blinking)
#define LED3_PIN 5      // Third alarm LED (blinking)
#define BUZZER_PIN 18   // Passive buzzer
#define GPS_RX_PIN 16   // GPS module RX
#define GPS_TX_PIN 17   // GPS module TX
```

### Firmware Upload
1. Install PlatformIO in VS Code
2. Open the `esp32_code` folder
3. Configure your WiFi credentials in `main.cpp`
4. Upload firmware to ESP32 device

## API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration

### Dashboard Endpoints
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/notifications` - User notifications

### Farm Management
- `GET /api/farms` - List all farms
- `POST /api/farms` - Create new farm
- `GET /api/fences` - List all fences
- `POST /api/fences` - Create new fence

### Cow Tracking
- `GET /api/cows` - List all cows
- `POST /api/esp32/data` - ESP32 data submission

### Collaborative System
- `POST /api/collaborative/link` - Generate ephemeral link

## Database Schema

### Core Tables
- **dbt1:** Farmer authentication (farmer_id, token, password, timestamp)
- **dbt2:** Farmer GPS tracking (farmer_token, gps_coordinate, timestamp)
- **dbt2_farms:** Farm information (farm_id, token, farmer_token, farm_gps, timestamp)
- **dbt4:** Fence data (fence_id, token, farmer_token, fence_nodes, area_size, timestamp)
- **dbt5:** Cow registration (cow_id, token, farmer_token, timestamp)
- **dbt6:** Real-time cow GPS (cow_token, real_time_coordinate, timestamp)
- **dbt7:** Cow tagging data (cow_token, tag, timestamp)
- **dbt8:** Cow speed data (cow_token, speed, timestamp)
- **dbt9:** Alarm breach logs (cow_token, alarm_breach_state, timestamp)
- **dbt16:** Collaborative sessions (assistive_cooperation_id, timestamp)

## Alarm System Logic

### Alarm Sequence
1. **Boundary Detection:** Cow position monitored via GPS
2. **Alarm 1 (Immediate):** LED1 activates when cow hits fence boundary
3. **Alarm 2 (15 seconds):** LED2 and LED3 alternate blinking
4. **Alarm 3 (50 seconds):** Buzzer cycles (20s ON, 5s OFF, repeat 3x)
5. **Final Phase:** LED1 ON for 30 seconds, then system reset
6. **Distance Alert:** Additional alert if cow moves >1m from boundary

### Gmail Integration
- Immediate breach notifications
- System status alerts
- Daily 24MPF reports at 23:59
- Collaborative recovery requests

## Deployment

### Heroku Deployment
1. Create Heroku application
2. Add Heroku Postgres addon
3. Configure environment variables
4. Deploy using Git:
```bash
git push heroku main
```

### Environment Variables (Heroku)
Configure the following in Heroku dashboard:
- `DATABASE_URL` (automatically set by Postgres addon)
- `JWT_SECRET`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `MEGA_EMAIL`
- `MEGA_PASSWORD`
- `GOOGLE_MAPS_API_KEY`

## Usage Guide

### For Farmers
1. **Sign Up/Login:** Create account or log in
2. **Setup Farm:** Add farm location using GPS or saved locations
3. **Create Fences:** Draw fence boundaries using polygon/freehand tools
4. **Add Cows:** Register cows and assign ESP32 devices
5. **Monitor:** View real-time tracking on dashboard
6. **Respond to Alerts:** Receive email notifications for breaches

### For Employees (Collaborative Recovery)
1. **Receive Link:** Get ephemeral recovery link via email
2. **Accept Request:** Click accept to start collaborative session
3. **Navigate:** Follow map directions to cow location
4. **Recover:** Guide cow back to fence boundary
5. **Complete:** Confirm successful recovery

## Troubleshooting

### Common Issues

**ESP32 Connection Problems:**
- Check WiFi credentials
- Verify server URL
- Ensure GPS has clear sky view

**Database Connection:**
- Verify DATABASE_URL format
- Check Heroku Postgres addon status
- Review connection pool settings

**Email Notifications:**
- Confirm Gmail app password
- Check spam folder
- Verify SMTP settings

**Map Loading Issues:**
- Validate Google Maps API key
- Check API quotas and billing
- Ensure proper API restrictions

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- **Email:** jeanclaudemng@gmail.com
- **Institution:** Near East University
- **Project Year:** 2025-2026

## Acknowledgments

- Near East University for project support
- Open source community for tools and libraries
- ESP32 and Arduino communities for hardware guidance

---

**SafeZone** - Protecting livestock through intelligent technology.

*Developed with ❤️ by Jean Claude & Samuel*