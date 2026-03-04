# 🚀 VPS Deployment Guide for Xinchao Daily News

This guide explains how to move your local development project to your VPS server.

## Prerequisites
- Access to your VPS (IP address, username, password/key).
- Node.js (v18+) installed on the VPS.
- A database (SQLite is used by default, so no extra setup needed unless you switch to MySQL/Postgres).

## Step 1: Prepare Your Local Code
1.  **Delete `node_modules` and `.next` folders** to make the transfer smaller.
    -   (Windows) `rmdir /s /q node_modules` and `rmdir /s /q .next`
2.  **Zip the project folder**:
    -   Select all files in `c:\XinchaodailyNews - gravity\web` EXCEPT `node_modules` and `.next`.
    -   Create a zip file named `xinchao-web.zip`.

## Step 2: Transfer to VPS
Use SCP (Secure Copy) or an FTP client (like FileZilla) to upload the zip file.

**Using SCP (Terminal):**
```bash
scp xinchao-web.zip your_username@your_vps_ip:/home/your_username/
```

## Step 3: Setup on VPS
1.  **SSH into your VPS**:
    ```bash
    ssh your_username@your_vps_ip
    ```
2.  **Unzip the project**:
    ```bash
    unzip xinchao-web.zip -d xinchao-web
    cd xinchao-web
    ```
3.  **Install Dependencies**:
    ```bash
    npm install
    ```
4.  **Setup Environment Variables**:
    -   Create a `.env` file (or copy `.env.local` if you uploaded it).
    -   `nano .env`
    -   Paste your environment variables (DATABASE_URL, OPENAI_API_KEY, etc.).
    -   Save and exit (Ctrl+O, Enter, Ctrl+X).

## Step 4: Build and Run
1.  **Build the application**:
    ```bash
    npm run build
    ```
2.  **Start with PM2 (Process Manager)**:
    -   Install PM2 if not installed: `npm install -g pm2`
    -   Start the app:
        ```bash
        pm2 start npm --name "xinchao-news" -- start
        ```
    -   Save the process list: `pm2 save`

## Step 5: Configure Nginx (Optional but Recommended)
If you want to access it via a domain (e.g., `daily.chaovietnam.co.kr`) instead of `IP:3000`:

1.  **Install Nginx**: `sudo apt install nginx`
2.  **Create Config**: `sudo nano /etc/nginx/sites-available/xinchao`
    ```nginx
    server {
        listen 80;
        server_name daily.chaovietnam.co.kr;

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
3.  **Enable Site**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/xinchao /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

## Maintenance
-   **View Logs**: `pm2 logs xinchao-news`
-   **Restart**: `pm2 restart xinchao-news`
-   **Update**: Upload new code, `npm install`, `npm run build`, `pm2 restart xinchao-news`
