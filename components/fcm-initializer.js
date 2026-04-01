import { getMessaging, getToken, onMessage, deleteToken } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging.js";
import { app } from '/config/firebase-config.js';
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const db = getFirestore(app);

// VAPID Key pública (la nueva que generaste)
const VAPID_KEY = "BCLXuBGDijYqT5jzx70dMS8bCnUB-Mm33ADbLEuAW8XPxU3Zx79hvthcUgzwXMRQl0rQy7QtFEad6MVl_o4ax4w";

class FCMInitializer {
    constructor() {
        this.messaging = null;
        this.userManager = null;
        this.currentToken = null;
        this.notificationsEnabled = false;
        this.deviceId = this.getOrCreateDeviceId();
        this.isInitialized = false;
        this.swRegistration = null;
    }

    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('fcm_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('fcm_device_id', deviceId);
        }
        return deviceId;
    }

    async init(userManagerInstance) {
        if (this.isInitialized) return;
        
        this.userManager = userManagerInstance;
        
        if (!this.checkBrowserSupport()) {
            console.warn('❌ Navegador no soporta notificaciones push');
            return;
        }

        try {
            this.messaging = getMessaging(app);
            
            // Registrar Service Worker
            await this.registerServiceWorker();
            
            // Configurar listener para mensajes en primer plano
            this.setupForegroundListener();
            
            // Cargar estado guardado
            this.loadLocalState();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Error inicializando FCM:', error);
        }
    }

    checkBrowserSupport() {
        return 'Notification' in window && 
               'serviceWorker' in navigator && 
               'PushManager' in window;
    }

    async registerServiceWorker() {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of registrations) {
                if (reg.active && reg.active.scriptURL.includes('firebase-messaging-sw')) {
                    this.swRegistration = reg;
                    return reg;
                }
            }

            this.swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                scope: '/'
            });
                        
            if (this.swRegistration.installing) {
                await new Promise((resolve) => {
                    const worker = this.swRegistration.installing;
                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'activated') {
                            resolve();
                        }
                    });
                });
            }
            
            return this.swRegistration;
            
        } catch (error) {
            console.error('❌ Error registrando Service Worker:', error);
            throw error;
        }
    }

    loadLocalState() {
        const savedState = localStorage.getItem(`fcm_enabled_${this.deviceId}`);
        this.notificationsEnabled = savedState === 'true';    }

    setupForegroundListener() {
        onMessage(this.messaging, (payload) => {
            const event = new CustomEvent('fcmMensaje', { detail: payload });
            document.dispatchEvent(event);
            
            if (this.notificationsEnabled && Notification.permission === 'granted') {
                new Notification(
                    payload.notification?.title || 'Centinela-MX',
                    {
                        body: payload.notification?.body || payload.data?.message || '',
                        icon: '/assets/images/logo.png',
                        badge: '/assets/images/logo-badge.png',
                        data: payload.data
                    }
                );
            }
        });
    }

    async getTokenAndSave() {
        if (!this.swRegistration) {
            await this.registerServiceWorker();
        }

        try {            
            const token = await getToken(this.messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: this.swRegistration
            });

            if (!token) {
                throw new Error('No se pudo obtener el token');
            }

            this.currentToken = token;
            
            // Guardar en Firestore usando los métodos de UserManager
            if (this.userManager?.currentUser) {
                await this.userManager.guardarDispositivo({
                    token: token,
                    deviceId: this.deviceId,
                    userAgent: navigator.userAgent,
                    platform: navigator.platform
                });
            }
            
            return token;

        } catch (error) {
            console.error('❌ Error obteniendo token:', error);
            throw error;
        }
    }

    async enableNotifications() {
        if (this.notificationsEnabled) return this.currentToken;

        if (!this.checkBrowserSupport()) {
            throw new Error('Navegador no compatible');
        }

        try {
            if (!this.swRegistration) {
                await this.registerServiceWorker();
            }

            const permission = await Notification.requestPermission();
            
            if (permission !== 'granted') {
                this.notificationsEnabled = false;
                localStorage.setItem(`fcm_enabled_${this.deviceId}`, 'false');
                throw new Error('Permiso denegado por el usuario');
            }

            
            await this.getTokenAndSave();
            
            this.notificationsEnabled = true;
            localStorage.setItem(`fcm_enabled_${this.deviceId}`, 'true');
            
            return this.currentToken;

        } catch (error) {
            console.error('❌ Error en enableNotifications:', error);
            throw error;
        }
    }

    async disableNotifications() {
        this.notificationsEnabled = false;
        localStorage.setItem(`fcm_enabled_${this.deviceId}`, 'false');
        
        if (this.currentToken && this.userManager?.currentUser) {
            try {
                await this.userManager.eliminarDispositivo(this.deviceId);
            } catch (error) {
                console.error('Error eliminando dispositivo:', error);
            }
        }
        
        if (this.messaging && this.currentToken) {
            try {
                await deleteToken(this.messaging);
                this.currentToken = null;
            } catch (e) {
                console.warn('Error eliminando token local:', e);
            }
        }
        
    }

    isEnabled() {
        return this.notificationsEnabled;
    }

    getCurrentToken() {
        return this.currentToken;
    }
}

// 👉 EXPORTACIÓN CORRECTA CON EL NOMBRE QUE ESPERA INICIOSESION.JS
export const fcmInitializer = new FCMInitializer();