# IP Webcam Setup Guide

## 📱 Using Your Phone as a Camera

Your SelfieBooth is now configured to use **IP Webcam** - an Android app that turns your phone into a wireless camera!

---

## Step 1: Install IP Webcam App

### Android:
1. Open **Google Play Store**
2. Search for **"IP Webcam"** by Pavel Khlebovich
3. Install the app (it's free!)

### Alternative Apps:
- **DroidCam** (Android & iOS)
- **EpocCam** (Android & iOS)

---

## Step 2: Start the Camera Server

1. **Open IP Webcam app** on your phone
2. Scroll down and tap **"Start server"**
3. The app will show you an IP address like:
   ```
   http://192.168.1.27:8080
   ```
4. **Write down this IP address!** You'll need it in the next step.

---

## Step 3: Update Your Computer's Configuration

### Option A: Using Same Network (Recommended)
1. Make sure your **phone** and **computer** are on the **same Wi-Fi network**
2. Open `vite.config.js` in your project
3. Find line 12:
   ```javascript
   target: 'http://192.168.1.27:8080', // Replace with your camera's IP
   ```
4. Replace `192.168.1.27:8080` with **your phone's IP address** from Step 2

### Option B: Using Mobile Hotspot
1. Turn on **Mobile Hotspot** on your phone
2. Connect your computer to the hotspot
3. In IP Webcam, the IP will usually be `192.168.43.1:8080`
4. Update `vite.config.js` with this IP

---

## Step 4: Restart Your Development Server

After updating the IP address:

```bash
# Stop the current server (Ctrl+C in terminal)
# Then restart:
npm run dev
```

---

## Step 5: Test the Camera

1. Open your SelfieBooth app (usually http://localhost:5173)
2. Tap to start → Select a category
3. You should see your **phone's camera feed**!

---

## 📋 Quick Reference

### Current Configuration:
- **IP Camera Mode**: ✅ Enabled (`USE_IP_CAMERA: true`)
- **Video Stream**: `/cam-proxy/video`
- **Photo Capture**: `/cam-proxy/shot.jpg`
- **Current Target IP**: Check `vite.config.js` line 12

### IP Webcam Default Endpoints:
- Video Stream: `http://YOUR_IP:8080/video`
- Snapshot: `http://YOUR_IP:8080/shot.jpg`
- Photo (high res): `http://YOUR_IP:8080/photo.jpg`

---

## 🔧 Troubleshooting

### "Cannot connect to camera"
- ✅ Check phone and computer are on same network
- ✅ Verify IP address in `vite.config.js` matches phone
- ✅ Make sure IP Webcam server is running on phone
- ✅ Try accessing `http://YOUR_IP:8080` in your browser

### "CORS Error"
- ✅ Restart the dev server after changing vite.config.js
- ✅ Check the proxy configuration is correct

### "Black screen" or "No video"
- ✅ Try `/cam-proxy/video` in browser to test
- ✅ Check phone camera permissions for IP Webcam
- ✅ Try restarting the IP Webcam server

### "Low quality / Laggy"
In IP Webcam app settings:
- Increase **Video resolution** (720p or 1080p)
- Increase **Quality**
- Set **FPS limit** to 30

---

## 🎯 Example: Full Setup

### Your Phone Shows:
```
Server is running at:
http://192.168.1.100:8080
```

### Update vite.config.js:
```javascript
'/cam-proxy': {
  target: 'http://192.168.1.100:8080',  // ← Change this line
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/cam-proxy/, ''),
  // ... rest of config
}
```

### Restart Server:
```bash
npm run dev
```

### Test in Browser:
1. Visit: http://localhost:5173
2. Try direct: http://localhost:5173/cam-proxy/video
   - Should show your phone's camera feed!

---

## 💡 Tips

- **Position your phone** like a tripod using a stand or prop
- **Keep phone plugged in** for long sessions
- **Use portrait or landscape** - the app adapts!
- **Good lighting** = better photos
- **Keep phone awake** in IP Webcam settings

---

## 🔄 Switch Back to Webcam

To use your computer's webcam instead:

1. Open `src/constants.js`
2. Change line 43:
   ```javascript
   USE_IP_CAMERA: false,  // Switch to false
   ```
3. Restart the dev server

---

## 📞 Need Help?

Common IP ranges by router:
- Most home routers: `192.168.1.x` or `192.168.0.x`
- Mobile hotspot: `192.168.43.1`
- Some routers: `10.0.0.x`

The port is usually `:8080` for IP Webcam.

---

Happy shooting! 📸
