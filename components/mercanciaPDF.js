import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

export const coloresMercancia = {
    ...coloresBase,
    riesgoCritico: '#ef4444',
    riesgoAlto: '#f97316',
    riesgoMedio: '#eab308',
    riesgoBajo: '#10b981',
    recuperado: '#28a745',
    activo: '#ffc107',
    cerrado: '#6c757d',
    robo: '#dc3545',
    extravio: '#ffc107',
    accidente: '#fd7e14'
};

// Configuración de imágenes
const IMAGEN_CONFIG = {
    TIMEOUT: 15000,
    MAX_RETRIES: 2,
    RETRY_DELAY: 1000,
    MAX_PARALLEL: 3,
    CACHE_DURATION: 300000,
    MAX_IMAGE_SIZE: 10 * 1024 * 1024,
    SUPPORTED_FORMATS: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
    TAMANIOS: {
        IMAGEN_PRINCIPAL: {
            ancho: 90,
            alto: 75
        },
        EVIDENCIA: {
            ancho: 85,
            alto: 70
        }
    },
    ALTURA_COMENTARIO: 18,
    ESPACIADO_COMENTARIO: 4,
    ALTURA_LINEA: 4.5,
    MAX_CARACTERES_COMENTARIO: 45
};

class MercanciaPDFGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        
        this.empresasCache = [];
        this.registroActual = null;
        
        this.imageCache = new Map();
        this.pendingImages = new Map();
        
        this.alturasContenedores = {
            identificacion: 18,
            datosGenerales: 28,
            clasificacion: 32,
            montos: 35,
            reportadoPor: 15,
            narracion: 50,
            detallesPerdida: 35,
            anexos: 110,
            historialRecuperaciones: 80,
            avisoPrivacidad: 25
        };
        
        this.configuracionCarta = {
            ancho: 215.9,
            alto: 279.4,
            margen: 15,
            alturaEncabezado: 42,
            alturaPie: 15
        };
    }

    configurar(config) {
        if (config.organizacionActual) {
            this.organizacionActual = config.organizacionActual;
            if (config.organizacionActual.logoUrl) {
                this.cargarLogoOrganizacion = async () => {
                    try {
                        const response = await fetch(config.organizacionActual.logoUrl);
                        if (response.ok) {
                            const blob = await response.blob();
                            this.logoOrganizacionData = await this.blobToBase64(blob);
                            this.logoOrganizacionCircular = await this.recortarImagenCircular(this.logoOrganizacionData);
                        }
                    } catch (error) {
                        console.error('Error cargando logo organización:', error);
                    }
                };
            }
        }
        if (config.empresasCache) this.empresasCache = config.empresasCache;
        if (config.authToken) this.authToken = config.authToken;
    }

    obtenerNombreEmpresa(nombreEmpresaCC) {
        if (!nombreEmpresaCC) return 'No especificada';
        return nombreEmpresaCC;
    }
    
    formatearMonto(monto) {
        if (!monto && monto !== 0) return '$0.00';
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        }).format(monto);
    }
    
    getTipoEventoTexto(tipo) {
        const tipos = {
            'robo': 'Robo',
            'extravio': 'Extravío',
            'accidente': 'Accidente',
            'otro': 'Otro'
        };
        return tipos[tipo] || tipo;
    }
    
    getEstadoTexto(estado) {
        const estados = {
            'activo': 'Activo',
            'recuperado': 'Recuperado',
            'cerrado': 'Cerrado'
        };
        return estados[estado] || estado;
    }
    
    getEstadoColor(estado) {
        const colores = {
            'activo': '#ffc107',
            'recuperado': '#28a745',
            'cerrado': '#6c757d'
        };
        return colores[estado] || '#ffc107';
    }
    
    formatearFechaVisualizacion(fecha) {
        if (!fecha) return 'Fecha no disponible';
        try {
            const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
            if (isNaN(fechaObj.getTime())) return 'Fecha no disponible';
            return fechaObj.toLocaleDateString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch {
            return 'Fecha no disponible';
        }
    }
    
    formatearHoraVisualizacion(fecha) {
        if (!fecha) return 'Hora no disponible';
        try {
            const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
            if (isNaN(fechaObj.getTime())) return 'Hora no disponible';
            return fechaObj.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return 'Hora no disponible';
        }
    }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    dividirTextoPorCaracteres(texto, maxChars = 45) {
        if (!texto) return [''];
        
        const lineas = [];
        const parrafos = texto.split('\n');
        
        for (const parrafo of parrafos) {
            if (parrafo.trim() === '') {
                lineas.push('');
                continue;
            }
            
            let inicio = 0;
            while (inicio < parrafo.length) {
                let fin = inicio + maxChars;
                if (fin >= parrafo.length) {
                    lineas.push(parrafo.substring(inicio));
                    break;
                }
                let corte = fin;
                while (corte > inicio && parrafo[corte] !== ' ' && parrafo[corte] !== '-' && parrafo[corte] !== ',' && parrafo[corte] !== ';') {
                    corte--;
                }
                if (corte === inicio) {
                    corte = fin;
                }
                lineas.push(parrafo.substring(inicio, corte));
                inicio = corte;
                while (inicio < parrafo.length && parrafo[inicio] === ' ') {
                    inicio++;
                }
            }
        }
        return lineas;
    }

    extraerUrlImagen(item) {
        if (!item) return null;
        
        if (typeof item === 'string') {
            const trimmed = item.trim();
            if (trimmed.startsWith('http') || trimmed.startsWith('data:image') || trimmed.startsWith('blob:')) {
                return trimmed;
            }
            return null;
        }
        
        if (typeof item === 'object') {
            if (item.url && typeof item.url === 'string') {
                let url = item.url.trim();
                return url;
            }
            
            const firebaseProps = ['downloadURL', 'storageUrl', 'firebaseUrl', 'urlDescarga'];
            for (const prop of firebaseProps) {
                if (item[prop] && typeof item[prop] === 'string') {
                    let url = item[prop].trim();
                    return url;
                }
            }
            
            const props = ['src', 'imageUrl', 'foto', 'imagen', 'evidencia', 'fotoUrl', 'imagenUrl'];
            for (const prop of props) {
                if (item[prop] && typeof item[prop] === 'string') {
                    const valor = item[prop].trim();
                    if (valor.startsWith('http') || valor.startsWith('data:image') || valor.startsWith('blob:')) {
                        return valor;
                    }
                }
            }
            
            if (item.path && typeof item.path === 'string') {
                return null;
            }
        }
        
        return null;
    }
    
    extraerComentario(item) {
        if (!item) return '';
        if (typeof item === 'string') return '';
        if (typeof item === 'object') {
            const props = ['comentario', 'descripcion', 'nombre', 'titulo', 'caption', 'texto', 'nota', 'observacion', 'detalle', 'comentarios', 'description'];
            for (const prop of props) {
                if (item[prop] && typeof item[prop] === 'string') return item[prop].trim();
            }
            if (item.metadata && item.metadata.comentario) return item.metadata.comentario;
        }
        return '';
    }
    
    esUrlValida(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (trimmed === '') return false;
        if (trimmed.startsWith('data:image')) return true;
        if (trimmed.startsWith('blob:')) return true;
        try {
            const urlObj = new URL(trimmed);
            return ['http:', 'https:', 'ftp:'].includes(urlObj.protocol);
        } catch {
            return false;
        }
    }
    
    normalizarUrl(url) {
        if (!url) return null;
        let normalized = url.trim();
        normalized = normalized.replace(/[?&](utm_|fbclid|gclid|_ga|_gl)[^&]*/g, '');
        normalized = normalized.replace(/[?&]$/, '');
        return normalized;
    }
    
    async cargarConFetch(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const headers = {};
            if (this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }
            
            const response = await fetch(url, {
                signal: controller.signal,
                headers: headers,
                mode: 'cors',
                cache: 'force-cache'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const blob = await response.blob();
            
            if (!blob.type.startsWith('image/')) {
                throw new Error('No es una imagen');
            }
            
            if (blob.size > IMAGEN_CONFIG.MAX_IMAGE_SIZE) {
                throw new Error(`Imagen muy grande: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
            }
            
            return await this.blobToBase64(blob);
            
        } catch (error) {
            console.warn('Fetch falló:', error.message);
            return null;
        }
    }
    
    async cargarConImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            const timeoutId = setTimeout(() => {
                img.src = '';
                resolve(null);
            }, 10000);
            
            img.onload = () => {
                clearTimeout(timeoutId);
                const canvas = document.createElement('canvas');
                const maxDimension = 1024;
                let width = img.width;
                let height = img.height;
                
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = (height * maxDimension) / width;
                        width = maxDimension;
                    } else {
                        width = (width * maxDimension) / height;
                        height = maxDimension;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            
            img.onerror = () => {
                clearTimeout(timeoutId);
                resolve(null);
            };
            
            img.crossOrigin = 'Anonymous';
            img.src = url;
        });
    }
    
    async cargarConProxy(url) {
        const proxies = [
            `https://corsproxy.io/?${encodeURIComponent(url)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            `https://cors-anywhere.herokuapp.com/${url}`
        ];
        
        for (const proxyUrl of proxies) {
            try {
                const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
                if (response.ok) {
                    const blob = await response.blob();
                    if (blob.type.startsWith('image/')) {
                        return await this.blobToBase64(blob);
                    }
                }
            } catch (error) {
                console.warn('Proxy falló:', error.message);
                continue;
            }
        }
        return null;
    }
    
    async cargarImagenMultiEstrategia(url, intento = 0) {
        const urlNormalizada = this.normalizarUrl(url);
        
        if (!this.esUrlValida(urlNormalizada)) {
            throw new Error('URL inválida');
        }
        
        const cacheKey = `${urlNormalizada}_${intento}`;
        
        if (this.imageCache.has(cacheKey)) {
            return this.imageCache.get(cacheKey);
        }
        
        if (this.pendingImages.has(cacheKey)) {
            return await this.pendingImages.get(cacheKey);
        }
        
        const estrategias = [
            () => this.cargarConFetch(urlNormalizada),
            () => this.cargarConImage(urlNormalizada),
            () => this.cargarConProxy(urlNormalizada)
        ];
        
        const cargaPromise = (async () => {
            let lastError = null;
            
            for (let i = 0; i < estrategias.length; i++) {
                try {
                    const resultado = await estrategias[i]();
                    if (resultado) {
                        this.imageCache.set(cacheKey, resultado);
                        setTimeout(() => {
                            this.imageCache.delete(cacheKey);
                        }, IMAGEN_CONFIG.CACHE_DURATION);
                        return resultado;
                    }
                } catch (error) {
                    lastError = error;
                    console.warn(`Estrategia ${i + 1} falló:`, error.message);
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            
            throw lastError || new Error('Todas las estrategias fallaron');
        })();
        
        this.pendingImages.set(cacheKey, cargaPromise);
        
        try {
            return await cargaPromise;
        } finally {
            setTimeout(() => {
                this.pendingImages.delete(cacheKey);
            }, 2000);
        }
    }
    
    async cargarImagenConReintentos(url, maxRetries = IMAGEN_CONFIG.MAX_RETRIES) {
        let lastError = null;
        
        for (let intento = 0; intento <= maxRetries; intento++) {
            try {
                if (intento > 0) {
                    const delay = IMAGEN_CONFIG.RETRY_DELAY * Math.pow(2, intento - 1);
                    await new Promise(r => setTimeout(r, delay));
                }
                return await this.cargarImagenMultiEstrategia(url, intento);
            } catch (error) {
                lastError = error;
                console.warn(`Intento ${intento + 1}/${maxRetries + 1} falló:`, error.message);
            }
        }
        
        throw lastError || new Error('No se pudo cargar la imagen');
    }
    
    async preCargarImagenes(items, onProgress) {
        const itemsValidos = items.filter(item => {
            const url = this.extraerUrlImagen(item);
            return url && this.esUrlValida(url);
        });
        
        if (itemsValidos.length === 0) {
            if (onProgress) onProgress(1);
            return new Map();
        }
        
        const resultados = new Map();
        let completadas = 0;
        
        const procesarImagen = async (item) => {
            try {
                const imagenUrl = this.extraerUrlImagen(item);
                if (!imagenUrl) {
                    completadas++;
                    return null;
                }
                
                const imgData = await this.cargarImagenConReintentos(imagenUrl);
                
                if (imgData) {
                    resultados.set(imagenUrl, imgData);
                }
                
                completadas++;
                if (onProgress) {
                    onProgress(completadas / itemsValidos.length);
                }
                
                return imgData;
            } catch (error) {
                console.error('Error precargando imagen:', error);
                completadas++;
                if (onProgress) {
                    onProgress(completadas / itemsValidos.length);
                }
                return null;
            }
        };
        
        const lotes = [];
        for (let i = 0; i < itemsValidos.length; i += IMAGEN_CONFIG.MAX_PARALLEL) {
            lotes.push(itemsValidos.slice(i, i + IMAGEN_CONFIG.MAX_PARALLEL));
        }
        
        for (const lote of lotes) {
            await Promise.all(lote.map(item => procesarImagen(item)));
        }
        
        return resultados;
    }
    
    async obtenerImagen(item) {
        const url = this.extraerUrlImagen(item);
        if (!url) return null;
        
        const cacheKey = this.normalizarUrl(url);
        for (const [key, value] of this.imageCache.entries()) {
            if (key.includes(cacheKey) || cacheKey.includes(key)) {
                return value;
            }
        }
        
        try {
            return await this.cargarImagenConReintentos(url);
        } catch (error) {
            console.error('Error obteniendo imagen:', error);
            return null;
        }
    }
    
    async dibujarImagenConComentario(pdf, imagen, x, y, ancho, alto, numero, anchoDisponible = null) {
        try {
            const imgData = await this.obtenerImagen(imagen);
            const comentario = this.extraerComentario(imagen);
            
            pdf.saveGraphicsState();
            
            const margenImagen = 5;
            const anchoConMargen = ancho - (margenImagen * 2);
            const altoConMargen = alto - (margenImagen * 2);
            
            pdf.setDrawColor(80, 80, 80);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, ancho, alto, 'S');
            
            if (imgData) {
                pdf.setFillColor(255, 255, 255);
                pdf.rect(x, y, ancho, alto, 'F');
                
                try {
                    const tempImg = new Image();
                    await new Promise((resolve, reject) => {
                        tempImg.onload = resolve;
                        tempImg.onerror = reject;
                        tempImg.src = imgData;
                    });
                    
                    const aspectRatio = tempImg.width / tempImg.height;
                    let drawWidth = anchoConMargen;
                    let drawHeight = altoConMargen;
                    
                    if (aspectRatio > 1) {
                        drawHeight = drawWidth / aspectRatio;
                    } else {
                        drawWidth = drawHeight * aspectRatio;
                    }
                    
                    const xOffset = (ancho - drawWidth) / 2;
                    const yOffset = (alto - drawHeight) / 2;
                    
                    pdf.addImage(imgData, 'JPEG', x + xOffset, y + yOffset, drawWidth, drawHeight, undefined, 'FAST');
                    
                } catch (imgError) {
                    pdf.addImage(imgData, 'JPEG', x + margenImagen, y + margenImagen, anchoConMargen, altoConMargen, undefined, 'FAST');
                }
            } else {
                this.dibujarPlaceholder(pdf, x, y, ancho, alto, numero);
            }
            
            pdf.restoreGraphicsState();
            
            const anchoTexto = anchoDisponible || ancho;
            const xComentario = x;
            const yComentario = y + alto + IMAGEN_CONFIG.ESPACIADO_COMENTARIO;
            
            if (comentario && comentario.trim() !== '') {
                const lineasComentario = this.dividirTextoPorCaracteres(comentario, IMAGEN_CONFIG.MAX_CARACTERES_COMENTARIO);
                const lineasMostrar = Math.min(lineasComentario.length + 1, 5);
                const alturaComentario = Math.min(lineasMostrar * IMAGEN_CONFIG.ALTURA_LINEA + 6, IMAGEN_CONFIG.ALTURA_COMENTARIO + 20);
                
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, alturaComentario + 4, 'F');
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                pdf.text("Descripción:", xComentario + 3, yComentario + 4);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                
                let yTexto = yComentario + 4;
                const lineasTexto = Math.min(lineasComentario.length, 4);
                for (let i = 0; i < lineasTexto; i++) {
                    pdf.text(lineasComentario[i], xComentario + 3, yTexto + (i * IMAGEN_CONFIG.ALTURA_LINEA) + 4);
                }
                
                if (lineasComentario.length <= 4) {
                    pdf.setFont('helvetica', 'italic');
                    pdf.setFontSize(this.fonts.mini - 1);
                    pdf.setTextColor(180, 180, 180);
                    pdf.text("─", xComentario + 3, yTexto + (lineasTexto * IMAGEN_CONFIG.ALTURA_LINEA) + 8);
                }
                
                if (lineasComentario.length > 4) {
                    pdf.setFont('helvetica', 'italic');
                    pdf.setTextColor(150, 150, 150);
                    pdf.text("(Más texto disponible)", xComentario + 3, yTexto + (4 * IMAGEN_CONFIG.ALTURA_LINEA) + 8);
                }
                
                return {
                    alturaUtilizada: alto + IMAGEN_CONFIG.ESPACIADO_COMENTARIO + alturaComentario + 8
                };
            } else {
                pdf.setFillColor(250, 250, 250);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, 12, 'F');
                
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(150, 150, 150);
                pdf.text("Sin descripción", xComentario + 3, yComentario + 6);
                
                return {
                    alturaUtilizada: alto + IMAGEN_CONFIG.ESPACIADO_COMENTARIO + 14
                };
            }
            
        } catch (error) {
            console.error(`Error dibujando imagen ${numero}:`, error);
            this.dibujarPlaceholder(pdf, x, y, ancho, alto, numero);
            return { alturaUtilizada: alto + IMAGEN_CONFIG.ESPACIADO_COMENTARIO + 14 };
        }
    }
    
    dibujarPlaceholder(pdf, x, y, ancho, alto, numero) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(x + 1, y + 1, ancho - 2, alto - 2, 'F');
        
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.rect(x, y, ancho, alto, 'S');
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`[ Imagen ${numero} no disponible ]`, x + (ancho / 2), y + (alto / 2), { align: 'center' });
    }
    
    async calcularTotalPaginasReal(registro) {
        let total = 1;
        let evidencias = registro.evidencias || [];
        
        if (evidencias.length > 2) {
            const evidenciasRestantes = evidencias.length - 2;
            total += Math.ceil(evidenciasRestantes / 2);
        }
        
        let recuperaciones = registro.historialRecuperaciones || [];
        if (recuperaciones.length > 3) {
            total += Math.ceil((recuperaciones.length - 3) / 4);
        }
        
        return total;
    }
    
    async generarPaginaReporte(pdf, registro, onProgress) {
        const margen = 15;
        const anchoPagina = this.configuracionCarta.ancho;
        const altoPagina = this.configuracionCarta.alto;
        const anchoContenido = anchoPagina - (margen * 2);
        let yPos = this.alturaEncabezado + 5;
        
        this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', registro.id);
        
        // IDENTIFICACIÓN
        pdf.setFillColor(coloresBase.fondo);
        pdf.rect(margen, yPos - 3, anchoContenido, this.alturasContenedores.identificacion, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(coloresBase.primario);
        pdf.text('IDENTIFICACIÓN DEL REGISTRO', margen + 2, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(coloresBase.texto);
        pdf.text(`FOLIO: ${registro.id}`, margen + 2, yPos);
        yPos += 4;
        pdf.text(`EMPRESA / CENTRO COMERCIAL: ${this.obtenerNombreEmpresa(registro.nombreEmpresaCC)}`, margen + 2, yPos);
        yPos += this.alturasContenedores.identificacion - 7;
        
        // =============================================
        // DATOS GENERALES (OPTIMIZADOS - SIN ESPACIOS MUERTOS)
        // =============================================
        pdf.setFillColor(coloresBase.fondo);
        pdf.rect(margen, yPos - 3, anchoContenido, this.alturasContenedores.datosGenerales, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(coloresBase.primario);
        pdf.text('DATOS GENERALES', margen + 2, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(coloresBase.texto);

        // Fecha y hora en la misma línea
        const fechaCreacion = registro.fechaCreacion ? new Date(registro.fechaCreacion) : (registro.fecha || new Date());
        const fechaStr = this.formatearFechaVisualizacion(fechaCreacion);
        const horaStr = this.formatearHoraVisualizacion(fechaCreacion);

        pdf.text(`FECHA: ${fechaStr}`, margen + 2, yPos);
        pdf.text(`HORA: ${horaStr}`, margen + 100, yPos);
        yPos += 5;

        // 👈 UBICACIÓN CON FORMATO OPTIMIZADO (31 caracteres por línea)
        let ubicacionCompleta = 'No especificada';

        if (registro.sucursalInfo) {
            const suc = registro.sucursalInfo;
            const partes = [];
            if (suc.ciudad) partes.push(suc.ciudad);
            if (suc.estado) partes.push(suc.estado);
            if (suc.direccion) partes.push(suc.direccion.substring(0, 60));
            if (partes.length > 0) ubicacionCompleta = partes.join(', ');
        } else if (registro.ubicacion && registro.ubicacion !== 'No especificada') {
            ubicacionCompleta = registro.ubicacion;
        } else if (registro.nombreEmpresaCC) {
            ubicacionCompleta = registro.nombreEmpresaCC;
        }

        const MAX_CARACTERES_UBICACION = 31;
        const lineasUbicacion = this.dividirTextoPorCaracteres(ubicacionCompleta, MAX_CARACTERES_UBICACION);
        
        // Mostrar primera línea con el label
        pdf.text(`UBICACIÓN: ${lineasUbicacion[0] || ''}`, margen + 2, yPos);
        let yUbicacion = yPos + 4;
        const xIndentado = margen + 13; // Alineado con el contenido después del label
        
        // Mostrar líneas adicionales indentadas
        for (let i = 1; i < lineasUbicacion.length; i++) {
            if (lineasUbicacion[i] && lineasUbicacion[i].trim() !== '') {
                pdf.text(lineasUbicacion[i], xIndentado, yUbicacion);
                yUbicacion += 4;
            }
        }
        
        // Calcular altura total usada por la ubicación
        const alturaUbicacion = lineasUbicacion.length * 4;
        yPos += Math.max(alturaUbicacion, this.alturasContenedores.datosGenerales - 10);
        
        // CLASIFICACIÓN DEL EVENTO
        pdf.setFillColor(coloresBase.fondo);
        pdf.rect(margen, yPos - 3, anchoContenido, this.alturasContenedores.clasificacion, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(coloresBase.primario);
        pdf.text('CLASIFICACIÓN DEL EVENTO', margen + 2, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(coloresBase.texto);
        
        pdf.text(`TIPO DE EVENTO: ${this.getTipoEventoTexto(registro.tipoEvento)}`, margen + 2, yPos);
        yPos += 4;
        pdf.text(`ESTADO ACTUAL: ${this.getEstadoTexto(registro.estado)}`, margen + 2, yPos);
        yPos += 4;
        
        const fechaEvento = registro.fecha ? new Date(registro.fecha) : new Date();
        const fechaEventoStr = this.formatearFechaVisualizacion(fechaEvento);
        const horaEventoStr = registro.hora || this.formatearHoraVisualizacion(fechaEvento);
        
        pdf.text(`FECHA DEL EVENTO: ${fechaEventoStr}`, margen + 2, yPos);
        pdf.text(`HORA: ${horaEventoStr}`, margen + 100, yPos);
        yPos += this.alturasContenedores.clasificacion - 16;
        
        // MONTOS
        pdf.setFillColor(coloresBase.fondo);
        pdf.rect(margen, yPos - 3, anchoContenido, this.alturasContenedores.montos, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(coloresBase.primario);
        pdf.text('INFORMACIÓN DE MONTOS', margen + 2, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(coloresBase.texto);
        
        const montoPerdido = this.formatearMonto(registro.montoPerdido);
        const montoRecuperado = this.formatearMonto(registro.montoRecuperado);
        const montoNeto = this.formatearMonto(registro.getMontoNeto ? registro.getMontoNeto() : (registro.montoPerdido - registro.montoRecuperado));
        const porcentajeRecuperado = registro.getPorcentajeRecuperado ? registro.getPorcentajeRecuperado().toFixed(2) : 
            (registro.montoPerdido > 0 ? ((registro.montoRecuperado / registro.montoPerdido) * 100).toFixed(2) : 0);
        
        pdf.setTextColor(coloresMercancia.robo);
        pdf.text(`MONTO PERDIDO: ${montoPerdido}`, margen + 2, yPos);
        pdf.setTextColor(coloresMercancia.recuperado);
        pdf.text(`MONTO RECUPERADO: ${montoRecuperado}`, margen + 100, yPos);
        yPos += 4;
        pdf.setTextColor(coloresBase.texto);
        pdf.text(`MONTO NETO (PÉRDIDA REAL): ${montoNeto}`, margen + 2, yPos);
        pdf.text(`PORCENTAJE RECUPERADO: ${porcentajeRecuperado}%`, margen + 100, yPos);
        yPos += this.alturasContenedores.montos - 11;
        
        // REPORTADO POR
        if (registro.reportadoPorNombre) {
            if (!this.verificarEspacio(pdf, yPos, this.alturasContenedores.reportadoPor + 5)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
                yPos = this.alturaEncabezado + 5;
            }
            
            pdf.setFillColor(coloresBase.fondo);
            pdf.rect(margen, yPos - 3, anchoContenido, this.alturasContenedores.reportadoPor, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(coloresBase.primario);
            pdf.text('REPORTADO POR:', margen + 2, yPos);
            yPos += 5;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(coloresBase.texto);
            pdf.text(registro.reportadoPorNombre, margen + 2, yPos);
            yPos += this.alturasContenedores.reportadoPor - 7;
        }
        
        // RESPONSABLE ASIGNADO
        if (registro.responsableAsignado) {
            if (!this.verificarEspacio(pdf, yPos, 18)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
                yPos = this.alturaEncabezado + 5;
            }
            
            pdf.setFillColor(coloresBase.fondo);
            pdf.rect(margen, yPos - 3, anchoContenido, 15, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(coloresBase.primario);
            pdf.text('RESPONSABLE ASIGNADO:', margen + 2, yPos);
            yPos += 5;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(coloresBase.texto);
            pdf.text(registro.responsableAsignado, margen + 2, yPos);
            yPos += 10;
        }
        
        // NARRACIÓN DE EVENTOS
        const lineasNarracion = this.dividirTextoEnLineas(pdf, registro.narracionEventos || 'No hay narración disponible.', anchoContenido - 10);
        const espacioNecesarioNarracion = 15 + (lineasNarracion.length * 4);
        const alturaNarracion = Math.max(this.alturasContenedores.narracion, espacioNecesarioNarracion + 10);
        
        if (!this.verificarEspacio(pdf, yPos, alturaNarracion)) {
            this.dibujarPiePagina(pdf);
            pdf.addPage();
            this.paginaActualReal++;
            this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
            yPos = this.alturaEncabezado + 5;
        }
        
        pdf.setFillColor(coloresBase.fondo);
        pdf.rect(margen, yPos - 3, anchoContenido, alturaNarracion, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(coloresBase.primario);
        pdf.text('NARRACIÓN DE LOS EVENTOS:', margen + 2, yPos);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(coloresBase.texto);
        
        let yTextoNarracion = yPos + 5;
        for (let i = 0; i < lineasNarracion.length; i++) {
            if (lineasNarracion[i] === '') {
                yTextoNarracion += 4;
            } else {
                pdf.text(lineasNarracion[i], margen + 5, yTextoNarracion);
                yTextoNarracion += 4;
            }
        }
        
        yPos = yTextoNarracion + 5;
        
        // DETALLES DE LA PÉRDIDA
        if (registro.detallesPerdida && registro.detallesPerdida.trim() !== '') {
            const lineasDetalles = this.dividirTextoEnLineas(pdf, registro.detallesPerdida, anchoContenido - 10);
            const espacioNecesarioDetalles = 15 + (lineasDetalles.length * 4);
            const alturaDetalles = Math.max(this.alturasContenedores.detallesPerdida, espacioNecesarioDetalles + 10);
            
            if (!this.verificarEspacio(pdf, yPos, alturaDetalles)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
                yPos = this.alturaEncabezado + 5;
            }
            
            pdf.setFillColor(coloresBase.fondo);
            pdf.rect(margen, yPos - 3, anchoContenido, alturaDetalles, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(coloresBase.primario);
            pdf.text('DETALLES DE LA PÉRDIDA:', margen + 2, yPos);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(coloresBase.texto);
            
            let yTextoDetalles = yPos + 5;
            for (let i = 0; i < lineasDetalles.length; i++) {
                if (lineasDetalles[i] === '') {
                    yTextoDetalles += 4;
                } else {
                    pdf.text(lineasDetalles[i], margen + 5, yTextoDetalles);
                    yTextoDetalles += 4;
                }
            }
            
            yPos = yTextoDetalles + 5;
        }
        
        // EVIDENCIAS FOTOGRÁFICAS (CON COMENTARIOS)
        let evidencias = registro.evidencias || [];
        
        if (evidencias.length > 0) {
            const imgWidth = IMAGEN_CONFIG.TAMANIOS.IMAGEN_PRINCIPAL.ancho;
            const imgHeight = IMAGEN_CONFIG.TAMANIOS.IMAGEN_PRINCIPAL.alto;
            const espaciado = 12;
            
            const evidenciasMostrar = Math.min(evidencias.length, 2);
            let alturaTotalAnexos = 15;
            
            for (let i = 0; i < evidenciasMostrar; i++) {
                const comentario = this.extraerComentario(evidencias[i]);
                let alturaExtra = IMAGEN_CONFIG.ESPACIADO_COMENTARIO + 9;
                if (comentario && comentario.trim() !== '') {
                    const lineasCom = this.dividirTextoPorCaracteres(comentario, IMAGEN_CONFIG.MAX_CARACTERES_COMENTARIO);
                    const lineas = Math.min(lineasCom.length, 4);
                    alturaExtra += Math.min(lineas * IMAGEN_CONFIG.ALTURA_LINEA, 24);
                }
                alturaTotalAnexos += imgHeight + alturaExtra + espaciado;
            }
            
            if (!this.verificarEspacio(pdf, yPos, alturaTotalAnexos)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
                yPos = this.alturaEncabezado + 5;
            }
            
            pdf.setFillColor(coloresBase.fondo);
            pdf.rect(margen, yPos - 3, anchoContenido, alturaTotalAnexos, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(coloresBase.primario);
            pdf.text('EVIDENCIAS FOTOGRÁFICAS', margen + 2, yPos);
            yPos += 8;
            
            for (let i = 0; i < evidenciasMostrar; i++) {
                const xPos = margen + 2;
                const numeroImagen = i + 1;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text(`Evidencia ${numeroImagen}`, xPos + 2, yPos - 3);
                
                const resultado = await this.dibujarImagenConComentario(pdf, evidencias[i], xPos, yPos, imgWidth, imgHeight, numeroImagen, imgWidth);
                
                yPos += resultado.alturaUtilizada + espaciado;
                
                if (onProgress) {
                    onProgress(Math.min(95, 50 + (i / evidencias.length) * 30));
                }
            }
            yPos += 5;
        }
        
        // Evidencias restantes (a partir de la 3ra)
        if (evidencias.length > 2) {
            let evidenciasRestantes = evidencias.slice(2);
            let indiceEvidencia = 3;
            
            const imgWidth = IMAGEN_CONFIG.TAMANIOS.IMAGEN_PRINCIPAL.ancho;
            const imgHeight = IMAGEN_CONFIG.TAMANIOS.IMAGEN_PRINCIPAL.alto;
            const espaciado = 12;
            
            for (let i = 0; i < evidenciasRestantes.length; i++) {
                const comentario = this.extraerComentario(evidenciasRestantes[i]);
                let alturaExtra = IMAGEN_CONFIG.ESPACIADO_COMENTARIO + 9;
                if (comentario && comentario.trim() !== '') {
                    const lineasCom = this.dividirTextoPorCaracteres(comentario, IMAGEN_CONFIG.MAX_CARACTERES_COMENTARIO);
                    const lineas = Math.min(lineasCom.length, 4);
                    alturaExtra += Math.min(lineas * IMAGEN_CONFIG.ALTURA_LINEA, 24);
                }
                const alturaNecesaria = imgHeight + alturaExtra + 25;
                
                if (!this.verificarEspacio(pdf, yPos, alturaNecesaria)) {
                    this.dibujarPiePagina(pdf);
                    pdf.addPage();
                    this.paginaActualReal++;
                    this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
                    yPos = this.alturaEncabezado + 5;
                    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(this.fonts.normal);
                    pdf.setTextColor(coloresBase.primario);
                    pdf.text('EVIDENCIAS FOTOGRÁFICAS (CONTINUACIÓN)', margen, yPos);
                    yPos += 8;
                }
                
                const xPos = margen + 2;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text(`Evidencia ${indiceEvidencia}`, xPos + 2, yPos - 3);
                
                const resultado = await this.dibujarImagenConComentario(pdf, evidenciasRestantes[i], xPos, yPos, imgWidth, imgHeight, indiceEvidencia, imgWidth);
                
                yPos += resultado.alturaUtilizada + espaciado;
                indiceEvidencia++;
            }
        }
        
        // HISTORIAL DE RECUPERACIONES
        let recuperaciones = registro.historialRecuperaciones || [];
        
        if (recuperaciones && recuperaciones.length > 0) {
            const alturaHistorial = Math.min(this.alturasContenedores.historialRecuperaciones, 25 + (recuperaciones.length * 12));
            
            if (!this.verificarEspacio(pdf, yPos, alturaHistorial + 10)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
                yPos = this.alturaEncabezado + 5;
            }
            
            pdf.setFillColor(coloresBase.fondo);
            pdf.rect(margen, yPos - 3, anchoContenido, alturaHistorial, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(coloresBase.primario);
            pdf.text('HISTORIAL DE RECUPERACIONES', margen + 2, yPos);
            yPos += 5;
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(coloresBase.secundario);
            pdf.text('FECHA', margen + 5, yPos);
            pdf.text('MONTO', margen + 65, yPos);
            pdf.text('USUARIO', margen + 100, yPos);
            pdf.text('COMENTARIO', margen + 140, yPos);
            yPos += 4;
            
            pdf.setDrawColor(coloresBase.borde);
            pdf.setLineWidth(0.3);
            pdf.line(margen + 2, yPos - 1, anchoPagina - margen - 2, yPos - 1);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(coloresBase.texto);
            
            for (let i = 0; i < Math.min(recuperaciones.length, 8); i++) {
                const rec = recuperaciones[i];
                const fechaRec = rec.fecha ? new Date(rec.fecha) : new Date();
                const fechaStrRec = this.formatearFechaVisualizacion(fechaRec);
                const montoRec = this.formatearMonto(rec.monto);
                const usuarioRec = rec.usuarioNombre || rec.usuarioId || 'Sistema';
                const comentarioRec = rec.comentario || 'Sin comentario';
                const comentarioCorto = comentarioRec.length > 30 ? comentarioRec.substring(0, 27) + '...' : comentarioRec;
                
                pdf.text(fechaStrRec, margen + 5, yPos);
                pdf.text(montoRec, margen + 65, yPos);
                pdf.text(usuarioRec, margen + 100, yPos);
                pdf.text(comentarioCorto, margen + 140, yPos);
                yPos += 6;
            }
            
            yPos += 10;
        }
        
        // AVISO DE PRIVACIDAD
        const espacioRestante = altoPagina - yPos - 25;
        
        if (espacioRestante < this.alturasContenedores.avisoPrivacidad + 5) {
            this.dibujarPiePagina(pdf);
            pdf.addPage();
            this.paginaActualReal++;
            this.dibujarEncabezadoBase(pdf, 'MERCANCÍA PERDIDA/ROBADA', `${registro.id} (Continuación)`);
            yPos = this.alturaEncabezado + 5;
        }
        
        yPos = altoPagina - 25 - this.alturasContenedores.avisoPrivacidad;
        
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margen, yPos, anchoContenido, this.alturasContenedores.avisoPrivacidad, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(coloresBase.primario);
        pdf.text('AVISO DE PRIVACIDAD', margen + 2, yPos + 4);
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(coloresBase.textoClaro);
        
        const aviso = 'La información contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela y de la persona que ingresó los datos. Este reporte es un registro de mercancía perdida o robada y no constituye un documento legal oficial.';
        const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 10);
        
        for (let i = 0; i < lineasAviso.length; i++) {
            pdf.text(lineasAviso[i], margen + 2, yPos + 8 + (i * 3));
        }
        
        this.dibujarPiePagina(pdf);
    }
    
    async generarReporte(registro, opciones = {}) {
        try {
            const { 
                mostrarAlerta = true, 
                tituloAlerta = 'Generando Reporte de Mercancía Perdida...', 
                onProgress = null,
                returnBlob = false,
                diagnosticar = false
            } = opciones;
            
            if (diagnosticar) {
               
                
                if (registro.evidencias && registro.evidencias.length > 0) {
                    registro.evidencias.forEach((ev, i) => {
                        const url = this.extraerUrlImagen(ev);
                        
                        const comentario = this.extraerComentario(ev);
                        if (comentario) {
                            
                        }
                    });
                }
            }
            
            if (mostrarAlerta) {
                Swal.fire({
                    title: tituloAlerta,
                    html: `
                        <div class="progress-container" style="width:100%; margin-top:10px;">
                            <div class="progress-bar" style="width:0%; height:4px; background:linear-gradient(90deg, #1a3b5d, #c9a03d); border-radius:2px; transition:width 0.3s;"></div>
                            <p class="progress-text" style="margin-top:10px; font-size:12px; color:#666;">Preparando reporte...</p>
                        </div>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false
                });
            }
            
            const actualizarProgreso = (porcentaje, texto) => {
                if (mostrarAlerta && Swal.isVisible()) {
                    const progressBar = Swal.getPopup()?.querySelector('.progress-bar');
                    const progressText = Swal.getPopup()?.querySelector('.progress-text');
                    if (progressBar) progressBar.style.width = `${porcentaje}%`;
                    if (progressText && texto) progressText.textContent = texto;
                }
                if (onProgress) onProgress(porcentaje);
            };
            
            actualizarProgreso(5, 'Cargando librerías...');
            await this.cargarLibrerias();
            
            actualizarProgreso(10, 'Cargando logos...');
            await Promise.all([
                this.cargarLogoCentinela(),
                this.cargarLogoOrganizacion()
            ]);
            
            this.registroActual = registro;
            
            actualizarProgreso(15, 'Analizando evidencias...');
            
            let todasLasImagenes = registro.evidencias || [];
            
            if (todasLasImagenes.length > 0) {
                actualizarProgreso(20, `Precargando ${todasLasImagenes.length} evidencias...`);
                
                await this.preCargarImagenes(todasLasImagenes, (progress) => {
                    const porcentaje = 20 + (progress * 30);
                    actualizarProgreso(porcentaje, `Cargando evidencias... ${Math.round(progress * 100)}%`);
                });
            }
            
            actualizarProgreso(50, 'Generando páginas...');
            
            const pdf = new this.jsPDF({ 
                orientation: 'portrait', 
                unit: 'mm', 
                format: 'letter'
            });
            
            this.totalPaginas = await this.calcularTotalPaginasReal(registro);
            this.paginaActualReal = 1;
            
            await this.generarPaginaReporte(pdf, registro, actualizarProgreso);
            
            const nombreArchivo = `REPORTE_MERCANCIA_${registro.id?.substring(0, 8) || 'registro'}_${this.formatearFechaArchivo()}.pdf`;
            
            actualizarProgreso(95, 'Finalizando...');
            
            if (mostrarAlerta) {
                Swal.close();
                await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            }
            
            actualizarProgreso(100, 'Completado');
            
            if (returnBlob) {
                return pdf.output('blob');
            }
            
            return pdf;
            
        } catch (error) {
            console.error('Error generando reporte:', error);
            if (mostrarAlerta) {
                Swal.close();
                Swal.fire({ 
                    icon: 'error', 
                    title: 'Error', 
                    text: error.message || 'Error al generar el reporte',
                    footer: 'Verifica tu conexión a internet y que las imágenes sean accesibles.'
                });
            }
            throw error;
        }
    }
    
    async diagnosticarEstructuraImagen(registro) {
        
        
        let evidencias = registro.evidencias || [];
        
        
        
       
        
        
        return {
            totalEvidencias: evidencias.length,
            urlsEncontradas: evidencias.filter(e => this.extraerUrlImagen(e)).length
        };
    }
}

export const generadorMercanciaPDF = new MercanciaPDFGenerator();
export default generadorMercanciaPDF;