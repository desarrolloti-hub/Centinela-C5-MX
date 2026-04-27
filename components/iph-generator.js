// iph-generator.js - VERSIÓN 11.0 - DISEÑO OPTIMIZADO COMO SEGUIMIENTO

/**
 * IPH GENERATOR - Sistema Centinela
 * VERSIÓN: 11.0 - DISEÑO OPTIMIZADO (mismo que seguimiento)
 * 
 * - Ajuste dinámico de altura según aspect ratio de imágenes
 * - Elimina espacios desperdiciados en imágenes horizontales
 * - Primera hoja con 2 imágenes optimizadas
 */

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

export const coloresIPH = {
    ...coloresBase,
    riesgoCritico: '#c0392b',
    riesgoAlto: '#e67e22',
    riesgoMedio: '#f39c12',
    riesgoBajo: '#27ae60'
};

const CONFIG = {
    // TAMAÑOS BASE para imágenes (optimizados como seguimiento)
    ANCHO_IMAGEN: 88,
    ALTO_IMAGEN: 75,
    ESPACIADO_COLUMNAS: 12,
    ESPACIADO_FILAS: 15,
    MARGEN: 20,
    ALTURA_COMENTARIO: 24,
    ESPACIADO_COMENTARIO: 4,
    ALTURA_LINEA: 4.5,
    MARGEN_IMAGEN: 2,
    MARGEN_PIE_PAGINA: 12,
    MAX_CARACTERES_POR_LINEA: 88,
    MAX_CARACTERES_COMENTARIO: 100,
    ALTURA_SEGUIMIENTO_BASE: 28,
    ALTURA_EVIDENCIA_SEGUIMIENTO: 45,
    ESPACIO_ENTRE_BLOQUES: 2,
    ESPACIO_ENTRE_BLOQUES_TITULO: 1,
    MAX_PARALLEL_IMAGES: 4,
    IMAGE_TIMEOUT: 10000,
    MAX_IMAGE_SIZE: 10 * 1024 * 1024,
    // AJUSTE DINÁMICO
    AJUSTE_DINAMICO_ALTURA: true,
    ESPACIO_COMPACTO: 4,
    // Para comentarios
    MAX_LINEAS_COMENTARIO: 9,
    ALTURA_POR_LINEA_COMENTARIO: 4.5,
    ALTURA_SIN_COMENTARIO: 10,
    ESPACIADO_IMAGEN_SIN_COMENTARIO: 3
};

class IPHGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        
        this.sucursalesCache = [];
        this.categoriasCache = [];
        this.usuariosCache = [];
        this.incidenciaActual = null;
        this.imagenesCache = new Map();
        this.pendingImages = new Map();
        this.dimensionesImagenesCache = new Map(); // Cache para dimensiones
        
        this.configuracionCarta = {
            ancho: 215.9,
            alto: 279.4,
            margen: 20,
            alturaEncabezado: 38,
            alturaPie: 12
        };
    }

    async initStorage() {
        // Inicialización si es necesaria
    }

    configurar(config) {
        if (config.organizacionActual) this.organizacionActual = config.organizacionActual;
        if (config.sucursalesCache) this.sucursalesCache = config.sucursalesCache;
        if (config.categoriasCache) this.categoriasCache = config.categoriasCache;
        if (config.usuariosCache) this.usuariosCache = config.usuariosCache;
        if (config.authToken) this.authToken = config.authToken;
    }

    obtenerNombreSucursal(sucursalId) {
        if (!sucursalId) return 'No especificada';
        const sucursal = this.sucursalesCache.find(s => s.id === sucursalId);
        return sucursal ? sucursal.nombre : 'No disponible';
    }
    
    obtenerNombreCategoria(categoriaId) {
        if (!categoriaId) return 'No especificada';
        const categoria = this.categoriasCache.find(c => c.id === categoriaId);
        return categoria ? categoria.nombre : 'No disponible';
    }
    
    obtenerNombreSubcategoria(subcategoriaId, categoriaId) {
        if (!subcategoriaId) return 'No especificada';
        const categoria = this.categoriasCache.find(c => c.id === categoriaId);
        if (categoria && categoria.subcategorias) {
            let subcategorias = [];
            if (categoria.subcategorias instanceof Map) {
                subcategorias = Array.from(categoria.subcategorias.values());
            } else if (typeof categoria.subcategorias === 'object') {
                subcategorias = Object.values(categoria.subcategorias);
            }
            const sub = subcategorias.find(s => s.id === subcategoriaId || s._id === subcategoriaId);
            if (sub) return sub.nombre || sub.descripcion || 'Subcategoría';
        }
        return 'No disponible';
    }
    
    obtenerNombreUsuario(usuarioId) {
        if (!usuarioId) return 'No especificado';
        const usuario = this.usuariosCache.find(u =>
            u.id === usuarioId || u.uid === usuarioId || u._id === usuarioId
        );
        if (usuario) {
            return usuario.nombreCompleto || usuario.nombre || usuario.displayName || 'Usuario';
        }
        return 'No especificado';
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
                return item.url.trim();
            }
            
            const firebaseProps = ['downloadURL', 'storageUrl', 'firebaseUrl', 'urlDescarga'];
            for (const prop of firebaseProps) {
                if (item[prop] && typeof item[prop] === 'string') {
                    return item[prop].trim();
                }
            }
            
            const props = ['src', 'path', 'imageUrl', 'foto', 'imagen', 'evidencia', 'fotoUrl', 'imagenUrl', 'preview'];
            for (const prop of props) {
                if (item[prop] && typeof item[prop] === 'string') {
                    const valor = item[prop].trim();
                    if (valor.startsWith('http') || valor.startsWith('data:image') || valor.startsWith('blob:')) {
                        return valor;
                    }
                }
            }
            
            if (item.file instanceof File) return item.file;
            if (item.archivo instanceof File) return item.archivo;
        }
        
        return null;
    }

    extraerComentario(item) {
        if (!item) return '';
        if (typeof item === 'string') return '';
        if (typeof item === 'object') {
            const props = ['comentario', 'descripcion', 'observacion', 'nota', 'detalle', 'description'];
            for (const prop of props) {
                if (item[prop] && typeof item[prop] === 'string') {
                    const comentario = item[prop].trim();
                    if (comentario) return comentario;
                }
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
    
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    async cargarConImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            const timeoutId = setTimeout(() => {
                img.src = '';
                resolve(null);
            }, CONFIG.IMAGE_TIMEOUT);
            
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
    
    async obtenerDimensionesImagen(url) {
        if (this.dimensionesImagenesCache.has(url)) {
            return this.dimensionesImagenesCache.get(url);
        }
        
        return new Promise((resolve) => {
            const img = new Image();
            const timeoutId = setTimeout(() => {
                resolve(null);
            }, 5000);
            
            img.onload = () => {
                clearTimeout(timeoutId);
                const dimensiones = { width: img.width, height: img.height, aspectRatio: img.width / img.height };
                this.dimensionesImagenesCache.set(url, dimensiones);
                resolve(dimensiones);
            };
            
            img.onerror = () => {
                clearTimeout(timeoutId);
                resolve(null);
            };
            
            img.src = url;
        });
    }
    
    async cargarImagenMultiEstrategia(url) {
        const urlNormalizada = this.normalizarUrl(url);
        
        if (!this.esUrlValida(urlNormalizada)) {
            return null;
        }
        
        if (this.imagenesCache.has(urlNormalizada)) {
            return this.imagenesCache.get(urlNormalizada);
        }
        
        if (this.pendingImages.has(urlNormalizada)) {
            return await this.pendingImages.get(urlNormalizada);
        }
        
        const cargaPromise = (async () => {
            try {
                const imgData = await this.cargarConImage(urlNormalizada);
                if (imgData) {
                    this.imagenesCache.set(urlNormalizada, imgData);
                    setTimeout(() => {
                        this.imagenesCache.delete(urlNormalizada);
                    }, 300000);
                }
                return imgData;
            } catch (error) {
                console.warn('Error cargando imagen:', error);
                return null;
            } finally {
                setTimeout(() => {
                    this.pendingImages.delete(urlNormalizada);
                }, 2000);
            }
        })();
        
        this.pendingImages.set(urlNormalizada, cargaPromise);
        
        try {
            return await cargaPromise;
        } catch {
            return null;
        }
    }
    
    async preCargarImagenes(items, onProgress) {
        const itemsValidos = items.filter(item => {
            const url = this.extraerUrlImagen(item);
            return url && this.esUrlValida(url);
        });
        
        if (itemsValidos.length === 0) {
            if (onProgress) onProgress(1);
            return;
        }
        
        let completadas = 0;
        
        const procesarImagen = async (item) => {
            try {
                const imagenUrl = this.extraerUrlImagen(item);
                if (!imagenUrl) {
                    completadas++;
                    return null;
                }
                
                await this.cargarImagenMultiEstrategia(imagenUrl);
                completadas++;
                if (onProgress) {
                    onProgress(completadas / itemsValidos.length);
                }
                return null;
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
        for (let i = 0; i < itemsValidos.length; i += CONFIG.MAX_PARALLEL_IMAGES) {
            lotes.push(itemsValidos.slice(i, i + CONFIG.MAX_PARALLEL_IMAGES));
        }
        
        for (const lote of lotes) {
            await Promise.all(lote.map(item => procesarImagen(item)));
        }
    }
    
    async obtenerImagen(item) {
        const url = this.extraerUrlImagen(item);
        if (!url) return null;
        return await this.cargarImagenMultiEstrategia(url);
    }

    /**
     * DIBUJA IMAGEN CON AJUSTE DINÁMICO DE ALTURA
     * Elimina espacios muertos calculando la altura REAL que ocupa la imagen según su aspect ratio
     */
    async dibujarImagen(pdf, imagenObj, x, y, ancho, alto, numero, anchoDisponible = null) {
        try {
            const imgData = await this.obtenerImagen(imagenObj);
            const comentario = this.extraerComentario(imagenObj);
            const tieneComentario = comentario && comentario.trim() !== '';
            
            pdf.saveGraphicsState();
            
            const margenImagen = CONFIG.MARGEN_IMAGEN;
            const anchoConMargen = ancho - (margenImagen * 2);
            
            // Calcular altura REAL que ocupará la imagen
            let alturaRealImagen = alto;
            let drawHeight = alto - (margenImagen * 2);
            let drawWidth = anchoConMargen;
            
            if (imgData) {
                try {
                    const tempImg = new Image();
                    await new Promise((resolve, reject) => {
                        tempImg.onload = resolve;
                        tempImg.onerror = reject;
                        tempImg.src = imgData;
                    });
                    
                    const aspectRatio = tempImg.width / tempImg.height;
                    
                    if (aspectRatio > 1) {
                        // Imagen horizontal: ajustar altura proporcionalmente
                        drawHeight = drawWidth / aspectRatio;
                        alturaRealImagen = drawHeight + (margenImagen * 2);
                    } else {
                        // Imagen vertical o cuadrada
                        drawWidth = drawHeight * aspectRatio;
                        alturaRealImagen = alto;
                    }
                    
                    const xOffset = (ancho - drawWidth) / 2;
                    const yOffset = (alto - drawHeight) / 2;
                    
                    pdf.setFillColor(255, 255, 255);
                    pdf.rect(x, y, ancho, alturaRealImagen, 'F');
                    
                    pdf.addImage(imgData, 'JPEG', x + xOffset, y + yOffset, drawWidth, drawHeight, undefined, 'FAST');
                    
                } catch (imgError) {
                    pdf.addImage(imgData, 'JPEG', x + margenImagen, y + margenImagen, anchoConMargen, alto - (margenImagen * 2), undefined, 'FAST');
                    alturaRealImagen = alto;
                }
            } else {
                this.dibujarPlaceholder(pdf, x, y, ancho, alto, numero);
                alturaRealImagen = alto;
            }
            
            // Dibujar borde ajustado a la altura real
            pdf.setDrawColor(80, 80, 80);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, ancho, alturaRealImagen, 'S');
            
            pdf.restoreGraphicsState();
            
            // Calcular altura del comentario
            const anchoTexto = anchoDisponible || ancho;
            const xComentario = x;
            const yComentario = y + alturaRealImagen + CONFIG.ESPACIADO_COMENTARIO;
            let alturaComentarioTotal = 0;
            
            if (tieneComentario) {
                const lineasComentario = this.dividirTextoPorCaracteres(comentario, CONFIG.MAX_CARACTERES_COMENTARIO);
                const lineasAMostrar = Math.min(lineasComentario.length, CONFIG.MAX_LINEAS_COMENTARIO);
                alturaComentarioTotal = 12 + (lineasAMostrar * CONFIG.ALTURA_POR_LINEA_COMENTARIO);
                
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, alturaComentarioTotal + 1, 'F');
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini - 0.5);
                pdf.setTextColor(80, 80, 80);
                pdf.text("Descripción:", xComentario + 2, yComentario + 2);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini - 0.5);
                pdf.setTextColor(80, 80, 80);
                
                let yTexto = yComentario + 2;
                for (let i = 0; i < lineasAMostrar; i++) {
                    pdf.text(lineasComentario[i], xComentario + 2, yTexto + (i * CONFIG.ALTURA_POR_LINEA_COMENTARIO) + 2);
                }
                
                if (lineasComentario.length > CONFIG.MAX_LINEAS_COMENTARIO) {
                    pdf.setFont('helvetica', 'italic');
                    pdf.text("(...)", xComentario + 2, yTexto + 15);
                }
            } else {
                alturaComentarioTotal = CONFIG.ALTURA_SIN_COMENTARIO;
                pdf.setFillColor(250, 250, 250);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, alturaComentarioTotal, 'F');
                
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(150, 150, 150);
                pdf.text("Sin descripción", xComentario + 2, yComentario + 2);
            }
            
            // RETORNAR la altura TOTAL REAL que ocupó este elemento
            return {
                alturaUtilizada: alturaRealImagen + CONFIG.ESPACIADO_COMENTARIO + alturaComentarioTotal + 2
            };
            
        } catch (error) {
            console.error(`Error dibujando imagen ${numero}:`, error);
            this.dibujarPlaceholder(pdf, x, y, ancho, alto, numero);
            return { alturaUtilizada: alto + CONFIG.ESPACIADO_COMENTARIO + 8 };
        }
    }

    dibujarPlaceholder(pdf, x, y, ancho, alto, numero) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(x + 1, y + 1, ancho - 2, alto - 2, 'F');
        
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.rect(x, y, ancho, alto, 'S');
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small - 1);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`[${numero}]`, x + (ancho / 2), y + (alto / 2), { align: 'center' });
    }

    dibujarMiniaturaPlaceholder(pdf, x, y, ancho, alto, numero) {
        pdf.setFillColor(240, 240, 240);
        pdf.rect(x, y, ancho, alto, 'F');
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.rect(x, y, ancho, alto, 'S');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`📷 ${numero}`, x + ancho / 2, y + alto / 2, { align: 'center' });
    }

    dividirTextoPorCaracteres(texto, maxChars = CONFIG.MAX_CARACTERES_POR_LINEA) {
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

    /**
     * DIBUJA SEGUIMIENTO CON ALTURA DINÁMICA
     */
    async dibujarSeguimiento(pdf, seguimiento, x, y, ancho, numero) {
        const fecha = seguimiento.fecha ? this.formatearFechaVisualizacion(seguimiento.fecha) : 'Fecha no disponible';
        const usuario = seguimiento.usuarioCodigo || seguimiento.usuarioNombre || 'Usuario';
        const descripcion = seguimiento.descripcion || 'Sin descripción';
        const evidencias = seguimiento.evidencias || [];
        
        let alturaTotal = CONFIG.ALTURA_SEGUIMIENTO_BASE;
        
        const lineasDescripcion = this.dividirTextoPorCaracteres(descripcion, CONFIG.MAX_CARACTERES_POR_LINEA - 10);
        const alturaDescripcion = Math.min(lineasDescripcion.length, 4) * CONFIG.ALTURA_LINEA;
        alturaTotal += alturaDescripcion;
        
        let alturaImagenesGrid = 0;
        const hayEvidencias = evidencias.length > 0;
        
        if (hayEvidencias) {
            const imgWidth = 88;
            const espaciadoVertical = 15;
            const imagenesPorFila = 2;
            const numeroFilas = Math.ceil(evidencias.length / imagenesPorFila);
            
            let alturaPorFila = 75 + 30;
            
            for (const evidencia of evidencias.slice(0, 4)) {
                const url = this.extraerUrlImagen(evidencia);
                if (url) {
                    const dimensiones = await this.obtenerDimensionesImagen(url);
                    if (dimensiones && dimensiones.aspectRatio > 1) {
                        const alturaReal = imgWidth / dimensiones.aspectRatio;
                        const alturaConComentario = alturaReal + 30;
                        if (alturaConComentario < alturaPorFila) {
                            alturaPorFila = Math.min(alturaPorFila, alturaConComentario);
                        }
                    }
                }
            }
            
            alturaImagenesGrid = (numeroFilas * alturaPorFila) + (numeroFilas > 1 ? (numeroFilas - 1) * espaciadoVertical : 0) + 15;
            alturaTotal += alturaImagenesGrid;
        }
        
        pdf.saveGraphicsState();
        pdf.setFillColor(248, 248, 248);
        pdf.rect(x, y, ancho, alturaTotal, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(60, 60, 60);
        pdf.text(`${usuario}`, x + 6, y + 6);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(100, 100, 100);
        pdf.text(fecha, x + ancho - 6, y + 6, { align: 'right' });
        
        pdf.setDrawColor(220, 220, 220);
        pdf.line(x + 4, y + 12, x + ancho - 4, y + 12);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(80, 80, 80);
        
        let yTexto = y + 18;
        const lineasAMostrar = Math.min(lineasDescripcion.length, 4);
        for (let i = 0; i < lineasAMostrar; i++) {
            pdf.text(lineasDescripcion[i], x + 6, yTexto);
            yTexto += CONFIG.ALTURA_LINEA;
        }
        
        if (lineasDescripcion.length > 4) {
            pdf.setFont('helvetica', 'italic');
            pdf.text("(Más texto disponible en el sistema)", x + 6, yTexto);
            yTexto += CONFIG.ALTURA_LINEA;
        }
        
        pdf.restoreGraphicsState();
        return alturaTotal;
    }
    
    /**
     * Dibuja una imagen de seguimiento con ajuste dinámico de altura
     */
    async dibujarImagenSeguimiento(pdf, evidencia, x, y, ancho, alto, numero) {
        try {
            let imgData = null;
            let comentario = '';
            
            if (typeof evidencia === 'string') {
                imgData = await this.obtenerImagen(evidencia);
                comentario = '';
            } else if (typeof evidencia === 'object') {
                const url = this.extraerUrlImagen(evidencia);
                if (url) imgData = await this.obtenerImagen(url);
                comentario = this.extraerComentario(evidencia) || '';
            }
            
            if (comentario && comentario.length > 50) {
                comentario = comentario.substring(0, 47) + '...';
            }
            
            const tieneComentario = comentario && comentario.trim() !== '';
            
            pdf.saveGraphicsState();
            
            const margenImagen = 1;
            const anchoConMargen = ancho - (margenImagen * 2);
            
            let alturaRealImagen = alto;
            let drawHeight = alto - (margenImagen * 2);
            let drawWidth = anchoConMargen;
            
            if (imgData) {
                try {
                    const tempImg = new Image();
                    await new Promise((resolve, reject) => {
                        tempImg.onload = resolve;
                        tempImg.onerror = reject;
                        tempImg.src = imgData;
                    });
                    
                    const aspectRatio = tempImg.width / tempImg.height;
                    
                    if (aspectRatio > 1) {
                        drawHeight = drawWidth / aspectRatio;
                        alturaRealImagen = drawHeight + (margenImagen * 2);
                    } else {
                        drawWidth = drawHeight * aspectRatio;
                        alturaRealImagen = alto;
                    }
                    
                    const xOffset = (ancho - drawWidth) / 2;
                    const yOffset = (alto - drawHeight) / 2;
                    
                    pdf.setFillColor(255, 255, 255);
                    pdf.rect(x, y, ancho, alturaRealImagen, 'F');
                    
                    pdf.addImage(imgData, 'JPEG', x + xOffset, y + yOffset, drawWidth, drawHeight, undefined, 'FAST');
                } catch (imgError) {
                    pdf.addImage(imgData, 'JPEG', x + margenImagen, y + margenImagen, anchoConMargen, alto - (margenImagen * 2), undefined, 'FAST');
                    alturaRealImagen = alto;
                }
            } else {
                this.dibujarPlaceholderSeguimiento(pdf, x, y, ancho, alto, numero);
                alturaRealImagen = alto;
            }
            
            pdf.setDrawColor(80, 80, 80);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, ancho, alturaRealImagen, 'S');
            
            pdf.restoreGraphicsState();
            
            const xComentario = x;
            const yComentario = y + alturaRealImagen + 3;
            const anchoTexto = ancho;
            
            if (tieneComentario) {
                const lineasComentario = this.dividirTextoPorCaracteres(comentario, 45);
                const lineasAMostrar = Math.min(lineasComentario.length, 3);
                const alturaComentario = 8 + (lineasAMostrar * 4.5);
                
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, alturaComentario + 2, 'F');
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                pdf.text("Descripción:", xComentario + 3, yComentario + 4);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                
                let yTextoCom = yComentario + 4;
                for (let i = 0; i < lineasAMostrar; i++) {
                    pdf.text(lineasComentario[i], xComentario + 3, yTextoCom + (i * 4.5) + 4);
                }
            } else {
                pdf.setFillColor(252, 252, 252);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, 10, 'F');
                
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(180, 180, 180);
                pdf.text("Sin descripción", xComentario + 3, yComentario + 4);
            }
            
        } catch (error) {
            console.error(`Error dibujando imagen de seguimiento ${numero}:`, error);
            this.dibujarPlaceholderSeguimiento(pdf, x, y, ancho, alto, numero);
        }
    }

    dibujarPlaceholderSeguimiento(pdf, x, y, ancho, alto, numero) {
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

    /**
     * Dibuja grid de imágenes con ajuste dinámico de altura
     */
    async dibujarGridImagenes(pdf, imagenes, margen, anchoContenido, yPos, altoPagina, offsetNumeracion = 0, tamanioReducido = true) {
        if (!imagenes || imagenes.length === 0) return yPos;
        
        const imgWidth = tamanioReducido ? CONFIG.ANCHO_IMAGEN : 88;
        const espaciadoHorizontal = CONFIG.ESPACIADO_COLUMNAS;
        const espaciadoVertical = CONFIG.ESPACIADO_FILAS;
        const imagenesPorFila = 2;
        
        let imagenIndex = 0;
        let yPosActual = yPos;
        let numeroPaginaActual = 0;
        
        while (imagenIndex < imagenes.length) {
            const imagenesRestantes = imagenes.length - imagenIndex;
            const imagenesEnEstaPagina = Math.min(4, imagenesRestantes);
            
            if (numeroPaginaActual > 0) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${this.incidenciaActual?.id || 'Incidencia'} (Cont.)`);
                yPosActual = this.alturaEncabezado + 12;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.normal - 1);
                pdf.setTextColor(0, 0, 0);
                pdf.text("EVIDENCIAS (Continuación)", margen + 4, yPosActual + 3);
                yPosActual += 15;
            }
            
            const anchoTotalFilas = (imgWidth * imagenesPorFila) + espaciadoHorizontal;
            const inicioX = margen + 4 + ((anchoContenido - 8 - anchoTotalFilas) / 2);
            const col1X = inicioX;
            const col2X = inicioX + imgWidth + espaciadoHorizontal;
            
            // PRIMERA FILA
            const imagenesFila1 = Math.min(2, imagenesEnEstaPagina);
            
            // Calcular altura máxima para primera fila
            let alturaMaxFila1 = tamanioReducido ? CONFIG.ALTO_IMAGEN : 75;
            for (let col = 0; col < imagenesFila1; col++) {
                const imagen = imagenes[imagenIndex + col];
                const url = this.extraerUrlImagen(imagen);
                if (url) {
                    const dimensiones = await this.obtenerDimensionesImagen(url);
                    if (dimensiones && dimensiones.aspectRatio > 1) {
                        const alturaReal = imgWidth / dimensiones.aspectRatio;
                        alturaMaxFila1 = Math.min(alturaMaxFila1, alturaReal);
                    }
                }
            }
            
            for (let col = 0; col < imagenesFila1; col++) {
                let xPos = col === 0 ? col1X : col2X;
                const imagen = imagenes[imagenIndex + col];
                const numeroImagen = offsetNumeracion + imagenIndex + col + 1;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                pdf.text(`Imagen ${numeroImagen}`, xPos + 2, yPosActual - 2);
                
                await this.dibujarImagenSeguimiento(pdf, imagen, xPos, yPosActual, imgWidth, alturaMaxFila1, numeroImagen);
            }
            
            const alturaFila1 = alturaMaxFila1 + 28;
            yPosActual += alturaFila1 + 5;
            let imagenesProcesadas = imagenesFila1;
            
            // SEGUNDA FILA
            if (imagenesEnEstaPagina > 2) {
                const imagenesFila2 = Math.min(2, imagenesEnEstaPagina - 2);
                
                let alturaMaxFila2 = tamanioReducido ? CONFIG.ALTO_IMAGEN : 75;
                for (let col = 0; col < imagenesFila2; col++) {
                    const imagen = imagenes[imagenIndex + 2 + col];
                    const url = this.extraerUrlImagen(imagen);
                    if (url) {
                        const dimensiones = await this.obtenerDimensionesImagen(url);
                        if (dimensiones && dimensiones.aspectRatio > 1) {
                            const alturaReal = imgWidth / dimensiones.aspectRatio;
                            alturaMaxFila2 = Math.min(alturaMaxFila2, alturaReal);
                        }
                    }
                }
                
                for (let col = 0; col < imagenesFila2; col++) {
                    let xPos = col === 0 ? col1X : col2X;
                    const imagen = imagenes[imagenIndex + 2 + col];
                    const numeroImagen = offsetNumeracion + imagenIndex + 2 + col + 1;
                    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(this.fonts.mini);
                    pdf.setTextColor(80, 80, 80);
                    pdf.text(`Imagen ${numeroImagen}`, xPos + 2, yPosActual - 2);
                    
                    await this.dibujarImagenSeguimiento(pdf, imagen, xPos, yPosActual, imgWidth, alturaMaxFila2, numeroImagen);
                }
                
                const alturaFila2 = alturaMaxFila2 + 28;
                yPosActual += alturaFila2 + espaciadoVertical;
                imagenesProcesadas += imagenesFila2;
            }
            
            imagenIndex += imagenesProcesadas;
            numeroPaginaActual++;
            
            if (imagenIndex < imagenes.length) {
                yPosActual += 5;
            }
        }
        
        return yPosActual + 10;
    }

    // =============================================
    // MÉTODO PRINCIPAL - PÁGINA OFICIAL CON DISEÑO OPTIMIZADO
    // =============================================
    
    async generarIPH(incidencia, opciones = {}) {
        try {
            const { 
                mostrarAlerta = true, 
                tituloAlerta = 'Generando informe oficial...', 
                onProgress = null,
                returnBlob = false,
                diagnosticar = false
            } = opciones;
    
            if (mostrarAlerta) {
                Swal.fire({
                    title: tituloAlerta,
                    html: `
                        <div style="text-align: center;">
                            <div class="progress-container" style="width:100%; margin-top:10px;">
                                <div class="progress-bar" style="width:0%; height:3px; background:#2c3e50; border-radius:2px;"></div>
                                <p class="progress-text" style="margin-top:12px; font-size:13px;">Procesando información...</p>
                            </div>
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
            
            actualizarProgreso(10, 'Cargando información...');
            await Promise.all([this.cargarLogoCentinela(), this.cargarLogoOrganizacion()]);
            
            this.incidenciaActual = incidencia;
            const imagenes = incidencia.imagenes || [];

            if (imagenes.length > 0) {
                actualizarProgreso(15, `Analizando ${imagenes.length} imágenes...`);
                await this.preCargarImagenes(imagenes, (progress) => {
                    const porcentaje = 15 + (progress * 35);
                    actualizarProgreso(porcentaje, `Cargando imágenes... ${Math.round(progress * 100)}%`);
                });
            } else {
                actualizarProgreso(15, 'No hay imágenes para procesar...');
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            actualizarProgreso(50, 'Componiendo documento...');
            
            const pdf = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            this.totalPaginas = 1;
            this.paginaActualReal = 1;
            
            await this.generarPaginaOficial(pdf, incidencia, actualizarProgreso);

            // CORREGIR PAGINACIÓN - NÚMEROS REALES
            actualizarProgreso(92, 'Corrigiendo numeración de páginas...');
            const totalPaginas = await this.corregirNumeracionPaginas(pdf);
          

            const folioId = incidencia.id ? incidencia.id.substring(0, 8).toUpperCase() : 'INC00000';
            const nombreArchivo = `INFORME_${folioId}_${this.formatearFechaArchivo()}.pdf`;

            actualizarProgreso(95, 'Finalizando...');

            if (mostrarAlerta) {
                Swal.close();
            }

            actualizarProgreso(100, 'Completado');

            if (returnBlob) return pdf.output('blob');
            return pdf;
            
        } catch (error) {
            console.error('Error generando informe:', error);
            if (mostrarAlerta) {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'Error al generar el informe' });
            }
            throw error;
        }
    }
    
    async generarPaginaOficial(pdf, incidencia, onProgress) {
        const margen = CONFIG.MARGEN;
        const anchoPagina = this.configuracionCarta.ancho;
        const altoPagina = this.configuracionCarta.alto;
        const anchoContenido = anchoPagina - (margen * 2);
        
        let yPos = this.alturaEncabezado + 4;
        
        this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', incidencia.id || 'Nueva Incidencia');
        
        // 1. IDENTIFICACIÓN DE LA UNIDAD
        pdf.saveGraphicsState();
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text("1. IDENTIFICACIÓN", margen + 4, yPos + 3);
        pdf.setDrawColor(180, 180, 180);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small - 0.5);
        pdf.setTextColor(60, 60, 60);
        
        const organizacion = this.organizacionActual?.nombre || incidencia.organizacion || 'Chedraui';
        pdf.text(`Organización: ${organizacion}`, margen + 4, yPos + 11);
        
        const sucursalNombre = incidencia.sucursalNombre || this.obtenerNombreSucursal(incidencia.sucursalId);
        pdf.text(`Sucursal: ${sucursalNombre}`, margen + 4, yPos + 16);
        
        let codigoReportante = incidencia.reportadoPorCodigo || '';
        if (codigoReportante && codigoReportante.trim() !== '') {
            pdf.text(`Reportado por operador: ${codigoReportante}`, margen + 4, yPos + 21);
        } else {
            const nombreReportante = incidencia.reportadoPorNombre || this.obtenerNombreUsuario(incidencia.reportadoPorId) || incidencia.creadoPorNombre || 'No especificado';
            pdf.text(`Reportado por operador: ${nombreReportante}`, margen + 4, yPos + 21);
        }
        pdf.restoreGraphicsState();
        yPos += 26;
        
        // 2. DATOS GENERALES
        pdf.saveGraphicsState();
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text("2. DATOS", margen + 4, yPos + 3);
        pdf.setDrawColor(180, 180, 180);
                pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small - 0.5);
        pdf.setTextColor(60, 60, 60);
        const fechaReporte = incidencia.fechaCreacion ? new Date(incidencia.fechaCreacion) : new Date();
        pdf.text(`Fecha: ${this.formatearFechaVisualizacion(fechaReporte)}`, margen + 4, yPos + 15);
        pdf.text(`Hora: ${this.formatearHoraVisualizacion(fechaReporte)}`, margen + 100, yPos + 15);
        pdf.restoreGraphicsState();
        yPos += 22;
        
        // 3. CLASIFICACIÓN
        pdf.saveGraphicsState();
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text("3. CLASIFICACIÓN", margen + 4, yPos + 3);
        pdf.setDrawColor(180, 180, 180);
                pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small - 0.5);
        const categoriaNombre = incidencia.categoriaNombre || this.obtenerNombreCategoria(incidencia.categoriaId);
        pdf.text(`Categoría: ${categoriaNombre}`, margen + 4, yPos + 15);
        const subcategoriaNombre = incidencia.subcategoriaNombre || this.obtenerNombreSubcategoria(incidencia.subcategoriaId, incidencia.categoriaId);
        pdf.text(`Subcategoría: ${subcategoriaNombre}`, margen + 4, yPos + 20);
        const nivelRiesgo = incidencia.nivelRiesgo || 'No especificado';
        const riesgoTexto = typeof nivelRiesgo === 'string' ? nivelRiesgo.toUpperCase() : String(nivelRiesgo);
        let riesgoColor = [60, 60, 60];
        if (nivelRiesgo === 'critico') riesgoColor = [192, 57, 43];
        else if (nivelRiesgo === 'alto') riesgoColor = [230, 126, 34];
        else if (nivelRiesgo === 'medio') riesgoColor = [243, 156, 18];
        else if (nivelRiesgo === 'bajo') riesgoColor = [39, 174, 96];
        pdf.setTextColor(riesgoColor[0], riesgoColor[1], riesgoColor[2]);
        pdf.text(`Riesgo: ${riesgoTexto}`, margen + 4, yPos + 25);
        pdf.setTextColor(60, 60, 60);
        const estado = incidencia.estado || 'No especificado';
        pdf.text(`Estado: ${estado === 'pendiente' ? 'Pendiente' : 'Finalizada'}`, margen + 4, yPos + 30);
        const fechaInicio = incidencia.fechaInicio ? new Date(incidencia.fechaInicio) : new Date();
        pdf.text(`Fecha del incidente: ${this.formatearFechaVisualizacion(fechaInicio)}`, margen + 4, yPos + 35);
        pdf.text(`Hora: ${this.formatearHoraVisualizacion(fechaInicio)}`, margen + 100, yPos + 35);
        pdf.restoreGraphicsState();
        yPos += 42;
        
        // 4. DESCRIPCIÓN DE LOS HECHOS
        const detalles = incidencia.detalles || 'No se proporcionó descripción.';
        const lineasDescripcion = this.dividirTextoPorCaracteres(detalles, CONFIG.MAX_CARACTERES_POR_LINEA);
        
        const ALTURA_TITULO = 10;
        const ALTURA_PADDING_SUPERIOR = 4;
        const ALTURA_PADDING_INFERIOR = 2;
        const ALTURA_POR_LINEA = CONFIG.ALTURA_LINEA;
        const alturaTextoNecesaria = lineasDescripcion.length * ALTURA_POR_LINEA;
        const alturaTotalNecesaria = ALTURA_TITULO + ALTURA_PADDING_SUPERIOR + alturaTextoNecesaria + ALTURA_PADDING_INFERIOR;
        const espacioDisponibleEnPagina = altoPagina - yPos - CONFIG.MARGEN_PIE_PAGINA;
        
        if (alturaTotalNecesaria <= espacioDisponibleEnPagina) {
            pdf.saveGraphicsState();
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal - 1);
            pdf.setTextColor(0, 0, 0);
            pdf.text("4. DESCRIPCIÓN", margen + 4, yPos + 3);
            pdf.setDrawColor(180, 180, 180);
                        pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small - 0.5);
            pdf.setTextColor(60, 60, 60);
            let yTexto = yPos + ALTURA_PADDING_SUPERIOR + 6;
            for (let i = 0; i < lineasDescripcion.length; i++) {
                pdf.text(lineasDescripcion[i], margen + 4, yTexto);
                yTexto += ALTURA_POR_LINEA;
            }
            pdf.restoreGraphicsState();
            yPos += alturaTotalNecesaria + CONFIG.ESPACIO_ENTRE_BLOQUES;
        } else {
            const lineasQueCaben = Math.floor((espacioDisponibleEnPagina - ALTURA_TITULO - ALTURA_PADDING_SUPERIOR - ALTURA_PADDING_INFERIOR) / ALTURA_POR_LINEA);
            const lineasEnPagina = Math.max(1, Math.min(lineasQueCaben, lineasDescripcion.length));
            pdf.saveGraphicsState();
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal - 1);
            pdf.setTextColor(0, 0, 0);
            pdf.text("4. DESCRIPCIÓN", margen + 4, yPos + 3);
            pdf.setDrawColor(180, 180, 180);
                        pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small - 0.5);
            pdf.setTextColor(60, 60, 60);
            let yTexto = yPos + ALTURA_PADDING_SUPERIOR + 6;
            for (let i = 0; i < lineasEnPagina; i++) {
                pdf.text(lineasDescripcion[i], margen + 4, yTexto);
                yTexto += ALTURA_POR_LINEA;
            }
            if (lineasDescripcion.length > lineasEnPagina) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(150, 150, 150);
                pdf.text(`(+${lineasDescripcion.length - lineasEnPagina} líneas más)`, margen + 4, yTexto + 2);
            }
            pdf.restoreGraphicsState();
            yPos += ALTURA_TITULO + ALTURA_PADDING_SUPERIOR + (lineasEnPagina * ALTURA_POR_LINEA) + ALTURA_PADDING_INFERIOR + 5;
        }
        
        // 5. EVIDENCIAS FOTOGRÁFICAS - PRIMERAS 2 IMÁGENES (optimizado como seguimiento)
        const imagenesPrincipales = incidencia.imagenes || [];
        
        if (imagenesPrincipales.length > 0) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal - 1);
            pdf.setTextColor(0, 0, 0);
            pdf.text("5. EVIDENCIAS FOTOGRÁFICAS", margen + 4, yPos + 3);
            yPos += 10;
            
            const primerasImagenes = imagenesPrincipales.slice(0, 2);
            const imgWidth = CONFIG.ANCHO_IMAGEN;
            const espaciadoHorizontal = CONFIG.ESPACIADO_COLUMNAS;
            const anchoTotalFilas = (imgWidth * 2) + espaciadoHorizontal;
            const inicioX = margen + 4 + ((anchoContenido - 8 - anchoTotalFilas) / 2);
            const col1X = inicioX;
            const col2X = inicioX + imgWidth + espaciadoHorizontal;
            
            // Calcular altura máxima para estas 2 imágenes
            let alturaMaxFila = CONFIG.ALTO_IMAGEN;
            for (const imagen of primerasImagenes) {
                const url = this.extraerUrlImagen(imagen);
                if (url) {
                    const dimensiones = await this.obtenerDimensionesImagen(url);
                    if (dimensiones && dimensiones.aspectRatio > 1) {
                        const alturaReal = imgWidth / dimensiones.aspectRatio;
                        alturaMaxFila = Math.min(alturaMaxFila, alturaReal);
                    }
                }
            }
            
            for (let i = 0; i < primerasImagenes.length; i++) {
                let xPos = i === 0 ? col1X : col2X;
                const imagen = primerasImagenes[i];
                const numeroImagen = i + 1;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                pdf.text(`Imagen ${numeroImagen}`, xPos + 2, yPos - 2);
                
                await this.dibujarImagenSeguimiento(pdf, imagen, xPos, yPos, imgWidth, alturaMaxFila, numeroImagen);
            }
            
            const alturaFilaImagenes = alturaMaxFila + 35;
            yPos += alturaFilaImagenes + 15;
            
            const imagenesRestantes = imagenesPrincipales.slice(2);
            
            if (imagenesRestantes.length > 0) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Cont.)`);
                yPos = this.alturaEncabezado + 12;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.normal - 1);
                pdf.setTextColor(0, 0, 0);
                pdf.text("5. EVIDENCIAS FOTOGRÁFICAS (Continuación)", margen + 4, yPos + 3);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(100, 100, 100);
                pdf.text(`${imagenesRestantes.length} imagen(es) restantes`, anchoPagina - margen - 35, yPos + 3);
                yPos += 15;
                
                yPos = await this.dibujarGridImagenes(pdf, imagenesRestantes, margen, anchoContenido, yPos, altoPagina, 2, true);
            }
        } else {
            pdf.saveGraphicsState();
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(120, 120, 120);
            pdf.text("No se adjuntaron evidencias fotográficas.", margen + 4, yPos + 12);
            pdf.restoreGraphicsState();
            yPos += 25;
        }
        
        this.dibujarPiePagina(pdf);
        
   

        
        // PÁGINAS PARA CADA SEGUIMIENTO
const seguimientos = incidencia.getSeguimientosArray ? incidencia.getSeguimientosArray() : [];

for (let i = 0; i < seguimientos.length; i++) {
    const seguimiento = seguimientos[i];
    
    pdf.addPage();
    this.paginaActualReal++;
    this.dibujarEncabezadoBase(pdf, `SEGUIMIENTO ${i + 1} de ${seguimientos.length}`, `${incidencia.id}`);
    
    let yPosSeg = this.alturaEncabezado + 8;
    
    const fecha = seguimiento.fecha ? this.formatearFechaVisualizacion(seguimiento.fecha) : 'Fecha no disponible';
    const usuario = seguimiento.usuarioCodigo || seguimiento.usuarioNombre || 'Usuario';
    
    pdf.saveGraphicsState();
    pdf.setFillColor(245, 248, 250);
    pdf.roundedRect(margen + 4, yPosSeg, anchoContenido - 8, 22, 4, 4, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.small);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`SEGUIMIENTO POR: ${usuario}`, margen + 10, yPosSeg + 6);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(this.fonts.mini);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${fecha}`, margen + 10, yPosSeg + 14);
    
    pdf.restoreGraphicsState();
    yPosSeg += 28;
    
    const descripcion = seguimiento.descripcion || 'Sin descripción';
    const lineasDescSeg = this.dividirTextoPorCaracteres(descripcion, CONFIG.MAX_CARACTERES_POR_LINEA - 10);
    const ALTURA_TITULO_DESC = 12;
    const PADDING_DESC = 8;
    const lineasAMostrar = Math.min(lineasDescSeg.length, 10);
    const alturaDescripcionReal = ALTURA_TITULO_DESC + (lineasAMostrar * CONFIG.ALTURA_LINEA) + PADDING_DESC;
    
    if (descripcion.trim() !== '' && descripcion !== 'Sin descripción') {
        pdf.saveGraphicsState();
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text("DESCRIPCIÓN DEL SEGUIMIENTO", margen + 6, yPosSeg + 3);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPosSeg + 8, margen + anchoContenido - 4, yPosSeg + 8);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(60, 60, 60);
        
        let yTextoDesc = yPosSeg + 16;
        for (let j = 0; j < lineasAMostrar; j++) {
            pdf.text(lineasDescSeg[j], margen + 6, yTextoDesc);
            yTextoDesc += CONFIG.ALTURA_LINEA;
        }
        
        if (lineasDescSeg.length > 10) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(120, 120, 120);
            pdf.text(`(+${lineasDescSeg.length - 10} líneas más)`, margen + 6, yTextoDesc + 2);
        }
        
        pdf.restoreGraphicsState();
        yPosSeg += alturaDescripcionReal + 5;
    } else {
        pdf.saveGraphicsState();
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(120, 120, 120);
        pdf.text("Sin descripción en este seguimiento", margen + 6, yPosSeg + 12);
        pdf.restoreGraphicsState();
        yPosSeg += 20;
    }
    
    const evidencias = seguimiento.evidencias || [];
    
    if (evidencias.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`EVIDENCIAS (${evidencias.length} imagen${evidencias.length !== 1 ? 'es' : ''})`, margen + 6, yPosSeg + 3);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPosSeg + 8, margen + anchoContenido - 4, yPosSeg + 8);
        yPosSeg += 18;
        
        yPosSeg = await this.dibujarGridImagenes(pdf, evidencias, margen, anchoContenido, yPosSeg, altoPagina, 0, true);
    } else {
        pdf.saveGraphicsState();
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(120, 120, 120);
        pdf.text("No se adjuntaron evidencias en este seguimiento", margen + 6, yPosSeg + 12);
        pdf.restoreGraphicsState();
        yPosSeg += 25;
    }
    
    // 👇 SOLO el pie de página, SIN el aviso de privacidad (porque ya se dibujará en la última página globalmente)
    this.dibujarPiePagina(pdf);
}

// Al final, después de todo, llamar a corregirNumeracionPaginas() que dibujará el aviso en la última página
    }


// =============================================
// PAGINACIÓN CORREGIDA (COPIA EXACTA DE SEGUIMIENTO)
// =============================================

/**
 * Corrige la numeración de páginas después de generar todo el PDF
 * @param {Object} pdf - Objeto jsPDF
 */
async corregirNumeracionPaginas(pdf) {
    const totalPaginasReales = pdf.internal.getNumberOfPages();
    
    if (totalPaginasReales <= 1) return totalPaginasReales;
    
    // Guardar el estado actual
    const currentPage = pdf.internal.getCurrentPageInfo().pageNumber;
    
    // Recorrer todas las páginas y re-dibujar el pie de página
    for (let i = 1; i <= totalPaginasReales; i++) {
        pdf.setPage(i);
        
        // Obtener dimensiones
        const margen = 15;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaPie = 15;
        const yPos = altoPagina - alturaPie - 2;
        
        // Limpiar el área del pie de página
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, yPos - 2, anchoPagina, alturaPie + 4, 'F');
        
        // Redibujar la línea
        pdf.setDrawColor('#dddddd');
        pdf.setLineWidth(0.5);
        pdf.line(margen, yPos, anchoPagina - margen, yPos);
        
        // Texto izquierdo
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(102, 102, 102);
        pdf.text('Reporte Generado con Sistema Centinela', margen, yPos + 5);
        
        // Texto derecho con número de página CORRECTO
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(102, 102, 102);
        pdf.text(`Página ${i} de ${totalPaginasReales}`, anchoPagina - margen, yPos + 5, { align: 'right' });
        
        // 👇👇👇 AVISO DE PRIVACIDAD SOLO EN LA ÚLTIMA PÁGINA 👇👇👇
        // EXACTAMENTE IGUAL QUE EN iph-generator-seguimiento.js
        if (i === totalPaginasReales) {
            const alturaAviso = 36;
            const margenAviso = 20;
            const anchoContenidoAviso = anchoPagina - (margenAviso * 2);
            
            pdf.saveGraphicsState();
            pdf.setFillColor(248, 248, 248);
            pdf.rect(margenAviso, altoPagina - alturaAviso - 18, anchoContenidoAviso, alturaAviso, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini || 8);
            pdf.setTextColor(80, 80, 80);
            pdf.text("AVISO DE PRIVACIDAD", margenAviso + 6, altoPagina - alturaAviso - 12);      
                  pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.mini - 0.5 || 7);
            pdf.setTextColor(100, 100, 100);
            
            const aviso = "La información contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela y de la persona que ingresó los datos. Este reporte tiene carácter informativo y puede ser utilizado como medio de prueba ante las autoridades correspondientes.";
            const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenidoAviso - 20);
           let yAviso = altoPagina - alturaAviso - 6;
            for (let j = 0; j < Math.min(lineasAviso.length, 3); j++) {
                pdf.text(lineasAviso[j], margenAviso + 6, yAviso + (j * 4));
            }
            pdf.restoreGraphicsState();
        }
        
        // Barra inferior
        pdf.setDrawColor('#0033A0');
        pdf.setFillColor('#0033A0');
        pdf.rect(0, altoPagina - 3, anchoPagina, 3, 'F');
    }
    
    // Volver a la página original
    pdf.setPage(currentPage);
    
    return totalPaginasReales;
}



}

export const generadorIPH = new IPHGenerator();
export default generadorIPH;