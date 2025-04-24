# 初血 Samurai CTF First Bloods

A beautiful, samurai-themed first bloods display for CTFd instances.

![Samurai First Bloods Screenshot](https://i.imgur.com/placeholder.png)

## Features

- 🩸 Track and display the first solves ("bloods") for each challenge
- 🏆 Highlight the teams that secured first bloods
- 🔍 Search functionality to find specific challenges or teams
- 📱 Responsive design for all devices
- ⚔️ Beautiful samurai-themed UI
- 🔄 Auto-refresh every 5 minutes

## Setup

### Prerequisites

- Node.js (v14 or newer)
- npm or yarn

### Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/samurai-ctf-firstbloods.git
   cd samurai-ctf-firstbloods
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure the CTFd URL and authentication:
   - Open `server.js`
   - Update the following constants with your CTFd instance details:
     ```js
     const CTFD_URL = 'https://yourctfd.example.com';
     const CTFD_USERNAME = 'your_username';
     const CTFD_PASSWORD = 'your_password';
     ```

4. Start the server:
   ```
   npm start
   ```

5. Access the first bloods display:
   - Open your browser and navigate to `http://localhost:3000`

## Development

To run the application in development mode with auto-reload:

```
npm run dev
```

## Deployment

You can deploy this application to any platform that supports Node.js applications (Heroku, Vercel, DigitalOcean, etc.)

### Example: Deploying to Heroku

1. Create a Heroku account and install the Heroku CLI
2. Login to Heroku:
   ```
   heroku login
   ```
3. Create a new Heroku app:
   ```
   heroku create your-app-name
   ```
4. Deploy to Heroku:
   ```
   git push heroku main
   ```

## Customization

### Colors and Themes

You can customize the look and feel by editing the CSS variables in `static/css/styles.css`:

```css
:root {
    --primary-color: #c41e3a; /* Red - traditional Japanese color */
    --secondary-color: #000000; /* Black */
    --accent-color: #e1b80d; /* Gold */
    --blood-color: rgba(196, 30, 58, 0.7);
    /* other variables... */
}
```

### Background Image

To change the background image, edit the following CSS in `static/css/styles.css`:

```css
.background-container {
    /* ... */
    background-image: url('path/to/your/image.jpg');
    /* ... */
}
```

## License

MIT

---

*First blood is the sweetest victory.* ⚔️ 🩸 