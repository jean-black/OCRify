# OCRify - Text Extraction from Images

OCRify is a web application that extracts text from images and provides downloadable output in TXT or PDF format.

## Features

- **Easy File Upload**: Drag and drop or click to upload images
- **Multiple Format Support**: Upload JPG, PNG, GIF, BMP, TIFF, and PDF files
- **OCR Processing**: Automatically extract text from uploaded images using Tesseract.js
- **Output Options**: Download extracted text as TXT or PDF files
- **User Queue System**: Automatic user session management
- **File History**: View recent processed files
- **Developer Portal**: Secure dashboard for developers to monitor the system
- **Database Tracking**: Complete tracking of files, users, and processing statistics

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **OCR Engine**: Tesseract.js
- **File Upload**: Multer
- **PDF Generation**: PDFKit
- **Frontend**: HTML5, CSS3, Vanilla JavaScript

## Folder Structure

```
safezone/
├── database/           # SQLite database file (modeblack.db)
├── document/          # Documentation files (README.md)
├── public/            # Frontend files
│   ├── css/          # Stylesheets
│   ├── js/           # JavaScript files
│   ├── images/       # Image assets
│   ├── audio/        # Audio assets
│   └── *.html        # HTML pages
├── server/           # Backend server files
│   ├── server.js    # Main server file
│   └── database.js  # Database configuration
├── server_logic_test/ # Test files
├── output/           # Processed files per user (output/user1/, output/user2/, etc.)
└── uploads/          # Temporary uploaded files
```

## Database Schema

### dbt1_developer
- Developer account information
- Connection tracking
- Usage statistics

### dbt2_user
- User queue positions (user1, user2, ...)
- File processing statistics
- Processing time tracking

### dbt3_file
- File information and metadata
- Extracted text content
- Language detection
- Processing timestamps

### dbt4_notification
- Notification system
- Message tracking
- Read/unread status

## Installation

### Prerequisites

- Node.js (v14.0.0 or higher)
- npm (Node Package Manager)

### Setup Steps

1. **Navigate to the project directory**:
   ```bash
   cd safezone
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Access the application**:
   - User Dashboard: http://localhost:3000
   - Developer Login: http://localhost:3000/dev
   - Developer Dashboard: http://localhost:3000/dev/dashboard

## Usage

### For Users

1. **Upload an Image**:
   - Drag and drop an image onto the upload zone
   - Or click "Select File" to browse your files
   - Supported formats: JPG, PNG, GIF, BMP, TIFF, PDF

2. **Select Output Format**:
   - Choose between TXT or PDF format for the extracted text

3. **Start Processing**:
   - Click "Start OCR Processing" button
   - Wait for the extraction to complete

4. **Download Results**:
   - View the extracted text in the results section
   - Click "Download File" to save the output

5. **View History**:
   - See your recent processed files below the results

### For Developers

1. **Login**:
   - Navigate to http://localhost:3000/dev
   - Email: modeblackmng@gmail.com
   - Password: 123456789dix

2. **Access Dashboard**:
   - View welcome message and system information
   - Access navigation icons for future features

3. **Available Pages** (Currently in development):
   - Dashboard: Welcome and overview
   - Notifications: System notifications (placeholder)
   - Profile: Developer profile management (placeholder)
   - Messages: Read/write messages (placeholder)
   - Logout: Secure logout (placeholder)

## API Endpoints

### User Endpoints

- `POST /api/get-user-session` - Create new user session
- `POST /api/upload` - Upload and process file
- `GET /api/download/:userPosition/:filename` - Download processed file
- `GET /api/files/:userPosition` - Get user file history

### Developer Endpoints

- `POST /api/dev/login` - Developer login
- `POST /api/dev/logout` - Developer logout

## Configuration

### Developer Account

- **App Email**: modeblackmng@gmail.com
- **Login Password**: 123456789dix
- **App Password**: dazcybxywevjoptd

### File Limits

- Maximum file size: 10MB
- Supported image types: JPEG, JPG, PNG, GIF, BMP, TIFF, PDF

## Database Location

The SQLite database is stored at:
```
safezone/database/modeblack.db
```

## Output Files

Processed files are organized by user:
```
safezone/output/user1/filename_extracted.txt
safezone/output/user2/filename_extracted.pdf
```

## Development

### Future Features (Placeholder Pages)

The following features are planned and currently show "work in progress" messages:

- **Notifications System**: View and manage system notifications
- **Messaging**: Send and receive messages within the platform
- **Profile Management**: Update developer profile information
- **Logout Functionality**: Secure session termination
- **Advanced Analytics**: Detailed usage statistics and reports

### Adding New Features

1. Update the corresponding HTML file in `public/`
2. Add necessary API endpoints in `server/server.js`
3. Update database schema if needed in `server/database.js`
4. Implement frontend logic in `public/js/`

## Troubleshooting

### Database Issues

If the database is not created automatically:
```bash
node server/database.js
```

### Port Conflicts

If port 3000 is already in use, set a different port:
```bash
PORT=4000 npm start
```

### OCR Performance

For better OCR results:
- Use high-resolution images
- Ensure good contrast between text and background
- Avoid blurry or distorted images
- Use images with clear, readable text

## Credits

- **Developer**: Jean Claude
- **Institution**: Near East University
- **Version**: 1.0
- **Application**: OCRify

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please contact the development team or check the documentation.

---

**Note**: This application is designed for educational and professional use. Ensure compliance with data privacy regulations when processing sensitive documents.
