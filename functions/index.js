// /functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

/**
 * Cloud Function para enviar una notificación push a un usuario específico.
 */
exports.sendPushNotification = functions.https.onRequest(async (req, res) => {
    // Habilitar CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ success: false, error: 'Método no permitido' });
        return;
    }

    const { userId, userType, organizacionCamelCase, title, body, url, senderToken } = req.body;

    // Validaciones básicas
    if (!userId || !userType || !title || !body) {
        res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
        return;
    }

    if (!['administrador', 'colaborador'].includes(userType)) {
        res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        return;
    }

    // Para colaboradores, necesitamos la organización
    if (userType === 'colaborador' && !organizacionCamelCase) {
        res.status(400).json({ success: false, error: 'Para colaboradores, se requiere organizacionCamelCase' });
        return;
    }

    try {
        // 1. Obtener el documento del usuario destino
        let userDocRef;
        if (userType === 'administrador') {
            userDocRef = db.collection('administradores').doc(userId);
        } else {
            const coleccion = `colaboradores_${organizacionCamelCase}`;
            userDocRef = db.collection(coleccion).doc(userId);
        }

        const userSnap = await userDocRef.get();
        if (!userSnap.exists) {
            res.status(404).json({ success: false, error: 'Usuario no encontrado' });
            return;
        }

        const userData = userSnap.data();

        // 2. Obtener los tokens activos del array 'dispositivos'
        const tokensActivos = [];
        if (userData.dispositivos && Array.isArray(userData.dispositivos)) {
            userData.dispositivos.forEach(disp => {
                if (disp.token && disp.enabled !== false) {
                    tokensActivos.push(disp.token);
                }
            });
        }

        if (tokensActivos.length === 0) {
            res.status(200).json({
                success: true,
                message: 'El usuario no tiene dispositivos con notificaciones activas.',
                successCount: 0,
                failures: 0
            });
            return;
        }

        console.log(`📱 Enviando a ${tokensActivos.length} dispositivo(s)`);

        // 3. Preparar el mensaje para FCM
        const messages = tokensActivos.map(token => ({
            token: token,
            notification: {
                title: title,
                body: body,
            },
            data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                title: title,
                body: body,
                url: url || '',
                incidenciaId: url ? url.split('/').pop() : '',
                tipo: userType,
                sender: senderToken || 'sistema',
                timestamp: Date.now().toString()
            },
            android: {
                priority: "high",
                notification: {
                    sound: "default",
                    clickAction: "FLUTTER_NOTIFICATION_CLICK"
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default"
                    }
                }
            }
        }));

        // 4. Enviar notificaciones en lote
        const responses = await Promise.allSettled(
            messages.map(msg => admin.messaging().send(msg))
        );

        // Contar éxitos y fallos
        const successCount = responses.filter(r => r.status === "fulfilled").length;
        const failureCount = responses.filter(r => r.status === "rejected").length;

        // Registrar detalles de fallos
        if (failureCount > 0) {
            responses.forEach((response, index) => {
                if (response.status === "rejected") {
                    console.error(`❌ Error en token ${index + 1}:`, response.reason);
                }
            });
        }

        console.log(`✅ Notificaciones enviadas. Éxitos: ${successCount}, Fallos: ${failureCount}`);

        res.status(200).json({
            success: true,
            message: `Notificación enviada a ${successCount} dispositivo(s)`,
            successCount: successCount,
            failures: failureCount
        });

    } catch (error) {
        console.error('❌ Error en Cloud Function:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

//Inicio de API REST para Power Manage Centinela-MX
// Victor Ramirez Cruz
const axios = require('axios');
const cors = require('cors')({ origin: true });

// Configuración de la API externa
const PM_API = "https://cenc5.com/rest_api/14.0"; // La documentación es la 13 pero JCI entrego la 14. NO MUEVAS LA VERSION

/**
 * Función centralizada para manejar peticiones a Power Manage
 */
exports.proxyPowerManage = functions.https.onRequest((req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: "Solo POST" });
        }

        const { action, email, password, email_code, app_id, user_token, panel_data, reset_password_code, new_password } = req.body;

        try {
            switch (action) {
                case 'solicitarCodigo':
                    await axios.post(`${PM_API}/register`, { email });
                    return res.status(200).json({ success: true });

                case 'completarRegistro':
                    const regRes = await axios.post(`${PM_API}/register/complete`, { email_code, app_id });
                    return res.status(200).json(regRes.data);

                case 'establecerContraseña':
                    const passRes = await axios.post(`${PM_API}/password/reset/complete`, {
                        reset_password_code,
                        new_password,
                        app_id
                    });
                    return res.status(200).json(passRes.data);

                case 'autenticar':
                    const authRes = await axios.post(`${PM_API}/auth`, { email, password, app_id });
                    return res.status(200).json(authRes.data);

                case 'listarPaneles':
                    const listRes = await axios.get(`${PM_API}/panels`, {
                        headers: { 'User-Token': user_token }
                    });
                    return res.status(200).json(listRes.data);

                case 'vincularPanel':
                    if (!panel_data || !panel_data.panel_serial || !panel_data.master_user_code) {
                        return res.status(400).json({ error_message: 'Faltan datos del panel' });
                    }

                    const payload = {
                        alias: panel_data.alias || 'Panel Nuevo',
                        panel_serial: panel_data.panel_serial,
                        master_user_code: panel_data.master_user_code
                    };

                    if (panel_data.access_proof) {
                        payload.access_proof = panel_data.access_proof;
                    }

                    const linkRes = await axios.post(`${PM_API}/panel/add`, payload, {
                        headers: { 'User-Token': user_token }
                    });

                    return res.status(200).json({ success: true, data: linkRes.data });

                case 'loginPanel':
                    if (!panel_data || !panel_data.panel_serial || !panel_data.user_code) {
                        return res.status(400).json({ error_message: 'Faltan datos: panel_serial y user_code son requeridos' });
                    }

                    const loginRes = await axios.post(`${PM_API}/panel/login`, {
                        panel_serial: panel_data.panel_serial,
                        user_code: panel_data.user_code,
                        app_id: panel_data.app_id,
                        app_type: panel_data.app_type || 'com.visonic.neogo'
                    }, {
                        headers: { 'User-Token': user_token }
                    });

                    return res.status(200).json(loginRes.data);

                case 'obtenerEstadoPanel':
                    const statusRes = await axios.get(`${PM_API}/status`, {
                        headers: { 'User-Token': user_token, 'Session-Token': req.body.session_token }
                    });
                    return res.status(200).json(statusRes.data);

                case 'listarZonas':
                    const devicesRes = await axios.get(`${PM_API}/devices`, {
                        headers: { 'User-Token': user_token, 'Session-Token': req.body.session_token }
                    });
                    const zonas = devicesRes.data.filter(d => d.device_type === 'ZONE');
                    return res.status(200).json(zonas);

                case 'listarEventos':
                    const eventsRes = await axios.get(`${PM_API}/events`, {
                        headers: { 'User-Token': user_token, 'Session-Token': req.body.session_token }
                    });
                    return res.status(200).json(eventsRes.data);

                case 'listarDispositivos':
                    const allDevicesRes = await axios.get(`${PM_API}/devices`, {
                        headers: { 'User-Token': user_token, 'Session-Token': req.body.session_token }
                    });
                    return res.status(200).json(allDevicesRes.data);

                case 'setEstadoPanel':
                    await axios.post(`${PM_API}/set_state`, {
                        partition: req.body.partition || 1,
                        state: req.body.state,
                        options: req.body.options || []
                    }, {
                        headers: { 'User-Token': user_token, 'Session-Token': req.body.session_token }
                    });
                    return res.status(200).json({ success: true });

                case 'verificarSesion':
                    try {
                        await axios.get(`${PM_API}/panel_info`, {
                            headers: { 'User-Token': user_token, 'Session-Token': req.body.session_token }
                        });
                        return res.status(200).json({ valid: true });
                    } catch (error) {
                        return res.status(401).json({ valid: false });
                    }
                case 'renamePanel':
                    // Cambiar el alias de un panel
                    console.log('📥 Renombrando panel:', {
                        panel_serial: req.body.panel_serial,
                        alias: req.body.alias
                    });

                    if (!req.body.panel_serial) {
                        return res.status(400).json({ error_message: 'Serial del panel es requerido' });
                    }

                    if (!req.body.alias) {
                        return res.status(400).json({ error_message: 'Alias es requerido' });
                    }

                    try {
                        const renameRes = await axios.post(`${PM_API}/panel/rename`, {
                            panel_serial: req.body.panel_serial,
                            alias: req.body.alias
                        }, {
                            headers: { 'User-Token': user_token }
                        });

                        console.log('✅ Panel renombrado:', renameRes.data);
                        return res.status(200).json({ success: true, data: renameRes.data });

                    } catch (error) {
                        console.error('❌ Error renombrando panel:', error.response?.data || error.message);
                        return res.status(error.response?.status || 500).json({
                            error_message: error.response?.data?.error_message || 'Error al renombrar el panel'
                        });
                    }
                default:
                    return res.status(400).json({ error: `Acción no reconocida: ${action}` });
            }
        } catch (error) {
            console.error(`❌ Error en ${action}:`, error.response?.data || error.message);
            return res.status(error.response?.status || 500).json(error.response?.data || { error_message: "Error en el servidor PM" });
        }
    });
});

// ========== FUNCIÓN PROGRAMADA: Generar snapshots diarios ==========
// Se ejecuta cada día a la 00:00 AM (hora de la Ciudad de México)

exports.generarSnapshotsDiarios = functions.pubsub
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub
    .schedule('0 0 * * *')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        console.log('📅 Iniciando generación diaria de snapshots...');

        try {
            // 1. Obtener todas las organizaciones desde "administradores"
            const adminsRef = db.collection('administradores');
            const adminsSnapshot = await adminsRef.get();

            const organizacionesSet = new Set();
            adminsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.organizacionCamelCase) {
                    organizacionesSet.add(data.organizacionCamelCase);
                }
            });

            const organizaciones = Array.from(organizacionesSet);
            console.log(`🏢 Se procesarán ${organizaciones.length} organizaciones`);

            // 2. Generar snapshot para cada una
            for (const orgId of organizaciones) {
                try {
                    await generarSnapshotOrganizacion(orgId);
                    console.log(`✅ Snapshot generado para: ${orgId}`);
                } catch (error) {
                    console.error(`❌ Error con ${orgId}:`, error);
                }
            }

            console.log('🏁 Generación diaria completada');
            return null;
        } catch (error) {
            console.error('Error general en la tarea programada:', error);
            return null;
        }
    });

// ========== FUNCIONES AUXILIARES ==========

/**
 * Genera un snapshot diario para una organización dada.
 * Guarda en la colección "operaciones" un documento con ID = orgId_YYYYMMDD
 */
async function generarSnapshotOrganizacion(orgId) {
    const hoy = new Date();
    const fechaStr = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
    const snapshotId = `${orgId}_${fechaStr}`;

    // --- FIRESTORE: Conteo de documentos por colección ---
    const coleccionesList = [
        `colaboradores_${orgId}`,
        `areas_${orgId}`,
        `regiones_${orgId}`,
        `sucursales_${orgId}`,
        `incidencias_${orgId}`,
        `categorias_${orgId}`,
        `tareas_${orgId}`,
        `permisos_${orgId}`,
        `notificaciones_${orgId}`,
        `registros_${orgId}`
    ];

    let totalDocumentos = 0;
    let coleccionesActivas = 0;
    const documentosPorColeccion = {};

    for (const colName of coleccionesList) {
        try {
            const snap = await db.collection(colName).get();
            const cantidad = snap.size;
            if (cantidad > 0) {
                coleccionesActivas++;
                documentosPorColeccion[colName] = cantidad;
                totalDocumentos += cantidad;
            }
        } catch (e) {
            // La colección no existe o no se puede leer, se ignora
        }
    }

    // Administradores que pertenecen a la organización
    try {
        const adminSnap = await db.collection('administradores')
            .where('organizacionCamelCase', '==', orgId)
            .get();
        const adminCount = adminSnap.size;
        if (adminCount > 0) {
            documentosPorColeccion[`administradores_${orgId}`] = adminCount;
            totalDocumentos += adminCount;
            coleccionesActivas++;
        }
    } catch (e) {
        // ignorar
    }

    // --- AUTH: Cantidad de administradores y colaboradores ---
    let colaboradores = 0, administradores = 0;
    try {
        const colabSnap = await db.collection(`colaboradores_${orgId}`).get();
        colaboradores = colabSnap.size;
    } catch (e) { }
    try {
        const adminSnap = await db.collection('administradores')
            .where('organizacionCamelCase', '==', orgId)
            .get();
        administradores = adminSnap.size;
    } catch (e) { }

    // --- STORAGE: Estadísticas de archivos (carpeta incidencias_orgId) ---
    const storageStats = {
        totalArchivos: 0,
        totalSizeBytes: 0,
        totalSizeMB: 0,
        porTipo: {
            pdf: { cantidad: 0, tamañoBytes: 0, tamañoMB: 0 },
            imagenes: { cantidad: 0, tamañoBytes: 0, tamañoMB: 0 },
            documentos: { cantidad: 0, tamañoBytes: 0, tamañoMB: 0 },
            multimedia: { cantidad: 0, tamañoBytes: 0, tamañoMB: 0 },
            otros: { cantidad: 0, tamañoBytes: 0, tamañoMB: 0 }
        },
        porCarpeta: {},
        ultimosArchivos: []
    };

    try {
        const bucket = admin.storage().bucket();
        const folder = `incidencias_${orgId}`;
        const [files] = await bucket.getFiles({ prefix: folder });

        storageStats.totalArchivos = files.length;
        const archivosConFecha = [];

        for (const file of files) {
            try {
                const [metadata] = await file.getMetadata();
                const size = parseInt(metadata.size, 10) || 0;
                storageStats.totalSizeBytes += size;

                const contentType = metadata.contentType || '';
                const tipo = clasificarArchivo(contentType, file.name);
                storageStats.porTipo[tipo].cantidad++;
                storageStats.porTipo[tipo].tamañoBytes += size;

                // Por carpeta (solo el segundo nivel)
                const partes = file.name.split('/');
                if (partes.length > 2) {
                    const sub = partes[2] || 'raiz';
                    if (!storageStats.porCarpeta[sub]) {
                        storageStats.porCarpeta[sub] = { cantidad: 0, tamañoBytes: 0 };
                    }
                    storageStats.porCarpeta[sub].cantidad++;
                    storageStats.porCarpeta[sub].tamañoBytes += size;
                }

                archivosConFecha.push({
                    nombre: file.name.split('/').pop(),
                    ruta: file.name,
                    tamaño: size,
                    tipo: tipo,
                    fecha: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date(0)
                });
            } catch (metadataError) {
                console.warn(`⚠️ No se pudo obtener metadata de ${file.name}:`, metadataError.message);
                // se omite este archivo para no interrumpir el proceso general
                continue;
            }
        }

        // Ordenar por fecha descendente y tomar los 5 más recientes
        archivosConFecha.sort((a, b) => b.fecha - a.fecha);
        storageStats.ultimosArchivos = archivosConFecha.slice(0, 5).map(f => ({
            nombre: f.nombre,
            ruta: f.ruta,
            tamaño: f.tamaño,
            tipo: f.tipo,
            fecha: f.fecha
        }));

        // Calcular totales en MB
        storageStats.totalSizeMB = Number((storageStats.totalSizeBytes / (1024 * 1024)).toFixed(2));
        for (const tipo of Object.keys(storageStats.porTipo)) {
            storageStats.porTipo[tipo].tamañoMB = Number((storageStats.porTipo[tipo].tamañoBytes / (1024 * 1024)).toFixed(2));
        }
    } catch (e) {
        console.warn(`⚠️ No se pudo obtener stats de storage para ${orgId}:`, e.message);
    }

    // --- GUARDAR EL DOCUMENTO SNAPSHOT ---
    const docRef = db.collection('operaciones').doc(snapshotId);
    await docRef.set({
        organizacion: orgId,
        nombreEmpresa: orgId, // Se podría obtener el nombre real, pero es suficiente
        fechaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
        conteos: {
            firestore: {
                colecciones: coleccionesActivas,
                documentos: totalDocumentos,
                documentosPorColeccion: documentosPorColeccion,
                lecturas: 0,
                escrituras: 0,
                actualizaciones: 0,
                eliminaciones: 0
            },
            storage: storageStats,
            auth: {
                totalUsuarios: colaboradores + administradores,
                administradores: administradores,
                colaboradores: colaboradores,
                superAdmin: 0
            },
            coleccionesPersonalizadas: documentosPorColeccion,
            metricas: {}
        }
    }, { merge: true });
}

/**
 * Clasifica un archivo según su contentType y extensión.
 */
function clasificarArchivo(contentType, nombreArchivo) {
    const extension = (nombreArchivo.split('.').pop() || '').toLowerCase();
    if (contentType.includes('pdf') || extension === 'pdf') return 'pdf';
    if (contentType.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'heif'].includes(extension)) return 'imagenes';
    if (contentType.includes('document') || contentType.includes('spreadsheet') || contentType.includes('presentation') || contentType.includes('text') || contentType.includes('application/msword') || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'odt', 'ods', 'odp', 'rtf'].includes(extension)) return 'documentos';
    if (contentType.includes('video') || contentType.includes('audio') || ['mp4', 'avi', 'mov', 'wmv', 'mkv', 'flv', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension)) return 'multimedia';
    return 'otros';
}