// /clases/operacion.js - CLASE COMPLETA SIN "GLOBAL"

import { db, storage } from '/config/firebase-config.js';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
    ref,
    listAll,
    getMetadata
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";

export class OperacionesEstadisticas {
    static COLECCION = 'operaciones';
    static cache = new Map();
    static storageCache = new Map();
    static procesando = new Set();
    static callbacksProgreso = new Set();
    
    constructor(organizacionId, datos = null) {
        this.id = organizacionId;
        this.organizacion = '';
        this.nombreEmpresa = '';
        this.fechaActualizacion = new Date();
        this.conteos = this._inicializarConteos();
        
        if (datos) {
            this.cargarDatos(datos);
        }
    }
    
    static onProgreso(callback) {
        this.callbacksProgreso.add(callback);
        return () => this.callbacksProgreso.delete(callback);
    }
    
    static _notificarProgreso(progreso) {
        this.callbacksProgreso.forEach(callback => {
            try {
                callback(progreso);
            } catch (error) {
                console.error('Error en callback de progreso:', error);
            }
        });
    }
    
    static _getDocRef(orgId) {
        return doc(db, this.COLECCION, orgId);
    }
    
    static bytesToMB(bytes) {
        return Number((bytes / (1024 * 1024)).toFixed(2));
    }
    
    static calcularPorcentaje(valor, total) {
        if (total === 0) return 0;
        return Number(((valor / total) * 100).toFixed(1));
    }
    
    static clasificarArchivo(contentType, nombreArchivo) {
        const extension = nombreArchivo.split('.').pop()?.toLowerCase() || '';
        
        if (contentType.includes('pdf') || extension === 'pdf') return 'pdf';
        if (contentType.includes('image') || 
            ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'heif'].includes(extension)) {
            return 'imagenes';
        }
        if (contentType.includes('document') || contentType.includes('spreadsheet') || 
            contentType.includes('presentation') || contentType.includes('text') || 
            contentType.includes('application/msword') ||
            ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'odt', 'ods', 'odp', 'rtf'].includes(extension)) {
            return 'documentos';
        }
        if (contentType.includes('video') || contentType.includes('audio') ||
            ['mp4', 'avi', 'mov', 'wmv', 'mkv', 'flv', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension)) {
            return 'multimedia';
        }
        return 'otros';
    }
    
    static async obtener(organizacionId) {
        if (this.cache.has(organizacionId)) {
            return this.cache.get(organizacionId);
        }
        
        try {
            const docRef = this._getDocRef(organizacionId);
            const docSnap = await getDoc(docRef);
            
            let instancia;
            if (docSnap.exists()) {
                instancia = new OperacionesEstadisticas(organizacionId, docSnap.data());
            } else {
                instancia = new OperacionesEstadisticas(organizacionId);
                await instancia.guardar();
            }
            
            this.cache.set(organizacionId, instancia);
            return instancia;
            
        } catch (error) {
            console.error(`Error obteniendo estadísticas de ${organizacionId}:`, error);
            return null;
        }
    }
    
    static async obtenerOrganizaciones() {
        try {
            const adminsRef = collection(db, "administradores");
            const adminsSnapshot = await getDocs(adminsRef);
            
            const organizacionesMap = new Map();
            
            adminsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.organizacionCamelCase && !organizacionesMap.has(data.organizacionCamelCase)) {
                    organizacionesMap.set(data.organizacionCamelCase, {
                        id: doc.id,
                        nombre: data.organizacion || data.organizacionCamelCase,
                        camelCase: data.organizacionCamelCase
                    });
                }
            });
            
            return Array.from(organizacionesMap.values());
            
        } catch (error) {
            console.error('Error obteniendo organizaciones:', error);
            return [];
        }
    }
    
    // =============================================
    // MÉTODO PRINCIPAL - OBTENER DATOS DE TODAS LAS EMPRESAS
    // =============================================
    static async obtenerDatosTodasEmpresas() {
        try {
            const operacionesRef = collection(db, this.COLECCION);
            const snapshot = await getDocs(operacionesRef);
            
            // Totales de todas las empresas
            const totales = {
                firestore: { documentos: 0, colecciones: 0 },
                storage: { 
                    totalArchivos: 0, 
                    totalSizeMB: 0, 
                    porTipo: {
                        pdf: { cantidad: 0, tamañoMB: 0 },
                        imagenes: { cantidad: 0, tamañoMB: 0 },
                        documentos: { cantidad: 0, tamañoMB: 0 },
                        multimedia: { cantidad: 0, tamañoMB: 0 },
                        otros: { cantidad: 0, tamañoMB: 0 }
                    } 
                },
                auth: { totalUsuarios: 0, administradores: 0, colaboradores: 0 }
            };
            
            const porEmpresa = [];
            
            for (const docSnap of snapshot.docs) {
                let instancia;
                
                if (this.cache.has(docSnap.id)) {
                    instancia = this.cache.get(docSnap.id);
                } else {
                    instancia = new OperacionesEstadisticas(docSnap.id, docSnap.data());
                    this.cache.set(docSnap.id, instancia);
                }
                
                porEmpresa.push(instancia);
                
                const resumen = instancia.getResumen();
                
                // Acumular totales
                totales.firestore.documentos += instancia.conteos.firestore.documentos;
                totales.firestore.colecciones += instancia.conteos.firestore.colecciones;
                totales.storage.totalArchivos += resumen.archivosTotales;
                totales.storage.totalSizeMB += resumen.tamanioTotalMB;
                totales.auth.totalUsuarios += resumen.totalUsuarios;
                totales.auth.administradores += resumen.administradores;
                totales.auth.colaboradores += resumen.colaboradores;
                
                // Acumular por tipo
                totales.storage.porTipo.pdf.cantidad += resumen.pdf.cantidad;
                totales.storage.porTipo.pdf.tamañoMB += resumen.pdf.tamanioMB;
                totales.storage.porTipo.imagenes.cantidad += resumen.imagenes.cantidad;
                totales.storage.porTipo.imagenes.tamañoMB += resumen.imagenes.tamanioMB;
                totales.storage.porTipo.documentos.cantidad += resumen.documentos.cantidad;
                totales.storage.porTipo.documentos.tamañoMB += resumen.documentos.tamanioMB;
                totales.storage.porTipo.multimedia.cantidad += resumen.multimedia.cantidad;
                totales.storage.porTipo.multimedia.tamañoMB += resumen.multimedia.tamanioMB;
                totales.storage.porTipo.otros.cantidad += resumen.otros.cantidad;
                totales.storage.porTipo.otros.tamañoMB += resumen.otros.tamanioMB;
            }
            
            return { totales, porEmpresa };
            
        } catch (error) {
            console.error('Error obteniendo datos de todas las empresas:', error);
            return {
                totales: {
                    firestore: { documentos: 0, colecciones: 0 },
                    storage: { totalArchivos: 0, totalSizeMB: 0, porTipo: {} },
                    auth: { totalUsuarios: 0, administradores: 0, colaboradores: 0 }
                },
                porEmpresa: []
            };
        }
    }
    
    static async actualizarUna(organizacionId, nombreOrganizacion = null) {
        try {
            const instancia = await this.obtener(organizacionId);
            if (instancia) {
                if (nombreOrganizacion) {
                    instancia.organizacion = nombreOrganizacion;
                    instancia.nombreEmpresa = nombreOrganizacion;
                }
                
                const actualizado = await instancia.actualizar();
                if (actualizado) {
                    await instancia.guardar();
                    return instancia;
                }
            }
            return null;
        } catch (error) {
            console.error(`Error actualizando ${organizacionId}:`, error);
            return null;
        }
    }
    
    static async actualizarTodas(opciones = {}) {
        const {
            limite = null,
            desde = 0,
            pausaEntreLotes = 800,
            loteSize = 2,
            skipCache = false
        } = opciones;
        
        try {
            const organizaciones = await this.obtenerOrganizaciones();
            
            if (!organizaciones || organizaciones.length === 0) {
                this._notificarProgreso({
                    completado: true,
                    total: 0,
                    procesadas: 0,
                    mensaje: 'No hay organizaciones para actualizar'
                });
                return [];
            }
            
            let empresasAProcesar = organizaciones;
            if (limite !== null) {
                empresasAProcesar = organizaciones.slice(desde, desde + limite);
            }
            
            const total = empresasAProcesar.length;
            let procesadas = 0;
            const resultados = [];
                    
            
            this._notificarProgreso({
                completado: false,
                total: total,
                procesadas: 0,
                mensaje: 'Iniciando actualización...'
            });
            
            if (skipCache) {
                this.storageCache.clear();
            }
            
            for (let i = 0; i < empresasAProcesar.length; i += loteSize) {
                const lote = empresasAProcesar.slice(i, i + loteSize);
                
                const loteResultados = await Promise.all(
                    lote.map(async (org) => {
                        if (!org.camelCase) return null;
                        
                        try {
                            const inicioEmpresa = Date.now();
                            
                            this._notificarProgreso({
                                completado: false,
                                total: total,
                                procesadas: procesadas,
                                actual: org.nombre || org.camelCase,
                                mensaje: `Procesando: ${org.nombre || org.camelCase}...`
                            });
                            
                            const instancia = await this.obtener(org.camelCase);
                            if (instancia) {
                                instancia.organizacion = org.nombre || org.camelCase;
                                instancia.nombreEmpresa = org.nombre || org.camelCase;
                                
                                const actualizado = await instancia.actualizar();
                                if (actualizado) {
                                    await instancia.guardar();
                                    
                                    const tiempoEmpresa = Date.now() - inicioEmpresa;                                   
                                    
                                    return instancia;
                                }
                            }
                        } catch (error) {
                            console.error(`Error actualizando ${org.camelCase}:`, error);
                            this._notificarProgreso({
                                completado: false,
                                total: total,
                                procesadas: procesadas,
                                actual: org.nombre || org.camelCase,
                                error: error.message,
                                mensaje: `Error en ${org.nombre}: ${error.message}`
                            });
                        }
                        return null;
                    })
                );
                
                const loteValidos = loteResultados.filter(r => r !== null);
                resultados.push(...loteValidos);
                procesadas += lote.length;
                
                this._notificarProgreso({
                    completado: false,
                    total: total,
                    procesadas: procesadas,
                    porcentaje: Math.round((procesadas / total) * 100),
                    ultimaEmpresa: lote[lote.length - 1]?.nombre,
                    mensaje: `Procesadas ${procesadas} de ${total} empresas`
                });
                
                if (i + loteSize < empresasAProcesar.length && pausaEntreLotes > 0) {
                    await new Promise(resolve => setTimeout(resolve, pausaEntreLotes));
                }
            }
            
            
            this._notificarProgreso({
                completado: true,
                total: total,
                procesadas: procesadas,
                exitosas: resultados.length,
                mensaje: `Actualización completada: ${resultados.length} de ${total} empresas`
            });
            
            return resultados;
            
        } catch (error) {
            console.error('Error actualizando todas:', error);
            this._notificarProgreso({
                completado: true,
                error: error.message,
                mensaje: `Error: ${error.message}`
            });
            return [];
        }
    }
    
    static limpiarCache() {
        this.cache.clear();
        this.storageCache.clear();
    }
    
    static exportarACSV(estadisticas) {
        if (!estadisticas || estadisticas.length === 0) return null;
        
        const headers = [
            'Organización',
            'Documentos Firestore',
            'Colecciones',
            'Archivos Storage',
            'Tamaño Total (MB)',
            'PDF Cantidad',
            'PDF Tamaño (MB)',
            'Imágenes Cantidad',
            'Imágenes Tamaño (MB)',
            'Documentos Cantidad',
            'Documentos Tamaño (MB)',
            'Multimedia Cantidad',
            'Multimedia Tamaño (MB)',
            'Otros Cantidad',
            'Otros Tamaño (MB)',
            'Administradores',
            'Colaboradores',
            'Total Usuarios',
            'Última Actualización'
        ];
        
        const filas = estadisticas.map(est => {
            const resumen = est.getResumen();
            return [
                est.nombreEmpresa || est.id,
                est.conteos.firestore.documentos,
                est.conteos.firestore.colecciones,
                resumen.archivosTotales,
                resumen.tamanioTotalMB,
                resumen.pdf.cantidad,
                resumen.pdf.tamanioMB,
                resumen.imagenes.cantidad,
                resumen.imagenes.tamanioMB,
                resumen.documentos.cantidad,
                resumen.documentos.tamanioMB,
                resumen.multimedia.cantidad,
                resumen.multimedia.tamanioMB,
                resumen.otros.cantidad,
                resumen.otros.tamanioMB,
                est.conteos.auth.administradores,
                est.conteos.auth.colaboradores,
                est.conteos.auth.totalUsuarios,
                est.fechaActualizacion.toLocaleString()
            ];
        });
        
        return [headers, ...filas];
    }
    
    // ==================== MÉTODOS DE INSTANCIA ====================
    
    _inicializarConteos() {
        return {
            firestore: {
                colecciones: 0,
                documentos: 0,
                documentosPorColeccion: {},
                lecturas: 0,
                escrituras: 0,
                actualizaciones: 0,
                eliminaciones: 0
            },
            storage: {
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
            },
            auth: {
                totalUsuarios: 0,
                administradores: 0,
                colaboradores: 0,
                superAdmin: 0
            },
            coleccionesPersonalizadas: {},
            metricas: {
                tiempoProcesamientoMs: 0,
                ultimaActualizacionExitosa: null,
                erroresConteo: 0
            }
        };
    }
    
    cargarDatos(datos) {
        this.organizacion = datos.organizacion || this.id;
        this.nombreEmpresa = datos.nombreEmpresa || this.id;
        
        if (datos.fechaActualizacion) {
            this.fechaActualizacion = datos.fechaActualizacion?.toDate ? 
                datos.fechaActualizacion.toDate() : new Date(datos.fechaActualizacion);
        }
        
        if (datos.conteos) {
            if (datos.conteos.firestore) {
                this.conteos.firestore = { ...this.conteos.firestore, ...datos.conteos.firestore };
            }
            if (datos.conteos.storage) {
                this.conteos.storage = { ...this.conteos.storage, ...datos.conteos.storage };
            }
            if (datos.conteos.auth) {
                this.conteos.auth = { ...this.conteos.auth, ...datos.conteos.auth };
            }
            if (datos.conteos.coleccionesPersonalizadas) {
                this.conteos.coleccionesPersonalizadas = { ...datos.conteos.coleccionesPersonalizadas };
            }
            if (datos.conteos.metricas) {
                this.conteos.metricas = { ...this.conteos.metricas, ...datos.conteos.metricas };
            }
        }
    }
    
    toFirestore() {
        return {
            organizacion: this.organizacion,
            nombreEmpresa: this.nombreEmpresa,
            fechaActualizacion: serverTimestamp(),
            conteos: this.conteos
        };
    }
    
    getResumen() {
        const storage = this.conteos.storage;
        const auth = this.conteos.auth;
        const totalArchivos = storage.totalArchivos;
        
        return {
            totalDocumentos: this.conteos.firestore.documentos,
            totalColecciones: this.conteos.firestore.colecciones,
            archivosTotales: totalArchivos,
            tamanioTotalMB: storage.totalSizeMB,
            pdf: {
                cantidad: storage.porTipo.pdf.cantidad,
                porcentaje: OperacionesEstadisticas.calcularPorcentaje(storage.porTipo.pdf.cantidad, totalArchivos),
                tamanioMB: storage.porTipo.pdf.tamañoMB
            },
            imagenes: {
                cantidad: storage.porTipo.imagenes.cantidad,
                porcentaje: OperacionesEstadisticas.calcularPorcentaje(storage.porTipo.imagenes.cantidad, totalArchivos),
                tamanioMB: storage.porTipo.imagenes.tamañoMB
            },
            documentos: {
                cantidad: storage.porTipo.documentos.cantidad,
                porcentaje: OperacionesEstadisticas.calcularPorcentaje(storage.porTipo.documentos.cantidad, totalArchivos),
                tamanioMB: storage.porTipo.documentos.tamañoMB
            },
            multimedia: {
                cantidad: storage.porTipo.multimedia.cantidad,
                porcentaje: OperacionesEstadisticas.calcularPorcentaje(storage.porTipo.multimedia.cantidad, totalArchivos),
                tamanioMB: storage.porTipo.multimedia.tamañoMB
            },
            otros: {
                cantidad: storage.porTipo.otros.cantidad,
                porcentaje: OperacionesEstadisticas.calcularPorcentaje(storage.porTipo.otros.cantidad, totalArchivos),
                tamanioMB: storage.porTipo.otros.tamañoMB
            },
            administradores: auth.administradores,
            colaboradores: auth.colaboradores,
            totalUsuarios: auth.totalUsuarios
        };
    }
    
    async actualizar() {
        const inicioTiempo = Date.now();
        
        try {
            
            const [firestoreStats, storageStats, authStats] = await Promise.all([
                this._recopilarFirestoreStats(),
                this._recopilarStorageStats(),
                this._recopilarAuthStats()
            ]);
            
            this.conteos.firestore = firestoreStats;
            this.conteos.storage = storageStats;
            this.conteos.auth = authStats;
            this.conteos.coleccionesPersonalizadas = firestoreStats.documentosPorColeccion;
            this.conteos.metricas.tiempoProcesamientoMs = Date.now() - inicioTiempo;
            this.conteos.metricas.ultimaActualizacionExitosa = new Date();
            
            this.fechaActualizacion = new Date();
            
            return true;
            
        } catch (error) {
            console.error(`Error actualizando ${this.id}:`, error);
            this.conteos.metricas.erroresConteo++;
            return false;
        }
    }
    
    async guardar() {
        try {
            const docRef = doc(db, OperacionesEstadisticas.COLECCION, this.id);
            await setDoc(docRef, this.toFirestore(), { merge: true });
            OperacionesEstadisticas.cache.set(this.id, this);
            return true;
        } catch (error) {
            console.error(`Error guardando ${this.id}:`, error);
            return false;
        }
    }
    
    async _recopilarFirestoreStats() {
        const coleccionesList = [
            `colaboradores_${this.id}`,
            `areas_${this.id}`,
            `regiones_${this.id}`,
            `sucursales_${this.id}`,
            `incidencias_${this.id}`,
            `categorias_${this.id}`,
            `tareas_${this.id}`,
            `permisos_${this.id}`,
            `notificaciones_${this.id}`,
            `registros_${this.id}`
        ];
        
        let totalDocumentos = 0;
        let coleccionesActivas = 0;
        const documentosPorColeccion = {};
        
        for (const nombreColeccion of coleccionesList) {
            try {
                const coleccionRef = collection(db, nombreColeccion);
                const snapshot = await getDocs(coleccionRef);
                const cantidad = snapshot.size;
                
                if (cantidad > 0) {
                    coleccionesActivas++;
                    documentosPorColeccion[nombreColeccion] = cantidad;
                    totalDocumentos += cantidad;
                }
            } catch (error) {
                // Colección no existe, ignorar
            }
        }
        
        try {
            const adminQuery = query(
                collection(db, "administradores"),
                where("organizacionCamelCase", "==", this.id)
            );
            const adminSnapshot = await getDocs(adminQuery);
            const adminCount = adminSnapshot.size;
            
            if (adminCount > 0) {
                documentosPorColeccion[`administradores_${this.id}`] = adminCount;
                totalDocumentos += adminCount;
                coleccionesActivas++;
            }
        } catch (error) {
            // Ignorar error
        }
        
        return {
            colecciones: coleccionesActivas,
            documentos: totalDocumentos,
            documentosPorColeccion: documentosPorColeccion,
            lecturas: 0,
            escrituras: 0,
            actualizaciones: 0,
            eliminaciones: 0
        };
    }
    
    async _recopilarStorageStats() {
        const cacheKey = `${this.id}_storage`;
        if (OperacionesEstadisticas.storageCache.has(cacheKey)) {
            const cacheData = OperacionesEstadisticas.storageCache.get(cacheKey);
            if (Date.now() - cacheData.timestamp < 300000) {
                return cacheData.data;
            }
        }
        
        try {
            const carpeta = `incidencias_${this.id}`;
            const carpetaRef = ref(storage, carpeta);
            
            const archivos = await this._listarArchivosRecursivamente(carpetaRef);
            
            const stats = {
                totalArchivos: archivos.length,
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
            
            for (const archivo of archivos) {
                try {
                    const metadata = await getMetadata(archivo);
                    const size = metadata.size;
                    
                    stats.totalSizeBytes += size;
                    
                    const tipo = OperacionesEstadisticas.clasificarArchivo(
                        metadata.contentType || '', 
                        archivo.name
                    );
                    
                    stats.porTipo[tipo].cantidad++;
                    stats.porTipo[tipo].tamañoBytes += size;
                    
                    const partes = archivo.fullPath.split('/');
                    if (partes.length > 2) {
                        const subcarpeta = partes[2] || 'raiz';
                        if (!stats.porCarpeta[subcarpeta]) {
                            stats.porCarpeta[subcarpeta] = { cantidad: 0, tamañoBytes: 0 };
                        }
                        stats.porCarpeta[subcarpeta].cantidad++;
                        stats.porCarpeta[subcarpeta].tamañoBytes += size;
                    }
                    
                    if (stats.ultimosArchivos.length < 5) {
                        stats.ultimosArchivos.push({
                            nombre: archivo.name,
                            ruta: archivo.fullPath,
                            tamaño: size,
                            tipo: tipo,
                            fecha: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date()
                        });
                    }
                    
                } catch (error) {
                    console.warn(`Error obteniendo metadata de ${archivo.name}:`, error);
                }
            }
            
            stats.totalSizeMB = OperacionesEstadisticas.bytesToMB(stats.totalSizeBytes);
            
            for (const tipo of Object.keys(stats.porTipo)) {
                stats.porTipo[tipo].tamañoMB = OperacionesEstadisticas.bytesToMB(stats.porTipo[tipo].tamañoBytes);
            }
            
            OperacionesEstadisticas.storageCache.set(cacheKey, {
                data: stats,
                timestamp: Date.now()
            });
            
            return stats;
            
        } catch (error) {
            
            return {
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
        }
    }
    
    async _listarArchivosRecursivamente(folderRef) {
        const archivos = [];
        try {
            const resultado = await listAll(folderRef);
            archivos.push(...resultado.items);
            
            for (const subCarpeta of resultado.prefixes) {
                const subArchivos = await this._listarArchivosRecursivamente(subCarpeta);
                archivos.push(...subArchivos);
            }
        } catch (error) {
            if (error.code !== 'storage/object-not-found') {
                console.error('Error listando archivos:', error);
            }
        }
        return archivos;
    }
    
    async _recopilarAuthStats() {
        try {
            let colaboradores = 0;
            let administradores = 0;
            
            try {
                const colabRef = collection(db, `colaboradores_${this.id}`);
                const colabSnap = await getDocs(colabRef);
                colaboradores = colabSnap.size;
            } catch (error) {
                // Colección no existe
            }
            
            try {
                const adminQuery = query(
                    collection(db, "administradores"),
                    where("organizacionCamelCase", "==", this.id)
                );
                const adminSnap = await getDocs(adminQuery);
                administradores = adminSnap.size;
            } catch (error) {
                // Ignorar
            }
            
            return {
                totalUsuarios: colaboradores + administradores,
                administradores: administradores,
                colaboradores: colaboradores,
                superAdmin: 0
            };
            
        } catch (error) {
            console.error('Error recopilando stats de auth:', error);
            return {
                totalUsuarios: 0,
                administradores: 0,
                colaboradores: 0,
                superAdmin: 0
            };
        }
    }
}

export default OperacionesEstadisticas;