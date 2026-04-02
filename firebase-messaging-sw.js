// Importar Firebase usando importScripts
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Configuración de Firebase de Centinela C5
const firebaseConfig = {
  apiKey: "AIzaSyAkRF8CUBs8dKlpk6N2U4EhESYhsOAW9sQ",
  authDomain: "centinela-c5.firebaseapp.com",
  databaseURL: "https://centinela-c5-default-rtdb.firebaseio.com",
  projectId: "centinela-c5",
  storageBucket: "centinela-c5.firebasestorage.app",
  messagingSenderId: "572612004113",
  appId: "1:572612004113:web:9ff187d18068d1fdf5a4b0",
  measurementId: "G-GP0ZLWBT7Y"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Obtener instancia de messaging
const messaging = firebase.messaging();

// ============================================
// FUNCIONALIDAD: Guardar última página en IndexedDB
// ============================================
const DB_NAME = 'CentinelaDB';
const DB_VERSION = 1;
const STORE_NAME = 'userData';

// Función para abrir la base de datos IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

// Función para obtener la última URL guardada
async function getLastVisitedUrl() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('lastVisitedUrl');
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const url = request.result || '/';
                resolve(url);
            };
        });
    } catch (error) {
        console.error('[SW] Error al obtener última URL:', error);
        return '/';
    }
}

// Función para guardar la URL en IndexedDB
async function saveLastVisitedUrl(url) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(url, 'lastVisitedUrl');
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve();
            };
        });
    } catch (error) {
        console.error('[SW] Error al guardar URL:', error);
    }
}

// Interceptar fetch para capturar las navegaciones
self.addEventListener('fetch', (event) => {
    // Solo procesar peticiones de navegación (cuando el usuario cambia de página)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Si la respuesta es exitosa, guardar la URL
                    if (response.status === 200) {
                        const url = event.request.url;
                        event.waitUntil(saveLastVisitedUrl(url));
                    }
                    return response;
                })
                .catch(error => {
                    console.error('[SW] Error en fetch:', error);
                    throw error;
                })
        );
    }
});

// Manejar mensajes desde las páginas (para guardar URL manualmente)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SAVE_URL') {
        const url = event.data.url;
        event.waitUntil(saveLastVisitedUrl(url));
    }
});
// ============================================
// FIN de funcionalidad de guardado de URL
// ============================================

// Manejador para mensajes en segundo plano
messaging.onBackgroundMessage(function(payload) {
  
  const notificationTitle = payload.notification?.title || 'Centinela C5';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.message || 'Nueva notificación',
    icon: '/assets/images/logo.png',
    badge: '/assets/images/logo.png',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Cerrar' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Manejar clic en la notificación
self.addEventListener('notificationclick', async function(event) {  
  event.notification.close();
  
  const data = event.notification.data;
  
  // Obtener la última URL visitada
  const lastUrl = await getLastVisitedUrl();
  
  // Determinar URL de destino
  let url = '/';
  
  if (data && data.incidenciaId) {
    // Si es una notificación de incidencia
    if (data.tipo === 'administrador') {
      url = `/usuarios/administrador/incidencias/incidencias.html`;
    } else if (data.tipo === 'colaborador') {
      url = `/usuarios/colaboradores/incidencias/incidencias.html`;
    } else {
      url = lastUrl;
    }
  } else {
    // Si no hay datos específicos, usar la última URL
    url = lastUrl;
  }
  
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (let client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

// Evento de instalación
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// Evento de activación
self.addEventListener('activate', function(event) {
  return self.clients.claim();
});