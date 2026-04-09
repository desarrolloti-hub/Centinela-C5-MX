// iph-generator.js - VERSIÓN 10.0 - IMÁGENES MÁS GRANDES (100x100) - 4 POR PÁGINA

/**
 * IPH GENERATOR - Sistema Centinela
 * VERSIÓN: 10.0 - IMÁGENES 100x100 - 4 POR PÁGINA
 * 
 * - Imágenes más grandes (100mm x 100mm)
 * - 4 imágenes por página (2x2)
 * - Límite de caracteres en descripciones para garantizar 4 por página
 * - Sin saltos de página innecesarios
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
    // NUEVAS DIMENSIONES: 100x100 para imágenes
    ANCHO_IMAGEN: 95,
    ALTO_IMAGEN: 85,
    // 4 imágenes por página en grid 2x2
    IMAGENES_POR_FILA: 2,
    IMAGENES_POR_COLUMNA: 2,
    IMAGENES_POR_PAGINA: 4,
    // Espaciados
    ESPACIADO_COLUMNAS: 5,
    ESPACIADO_FILAS: 20,
    MARGEN: 20,
    // Comentarios
    ALTURA_COMENTARIO: 18,
    ESPACIADO_COMENTARIO: 4,
    ALTURA_LINEA: 4.5,
    // Máximo de caracteres para descripción de imagen (garantiza que quepan 4 por página)
    MAX_CARACTERES_COMENTARIO: 50,
    MAX_LINEAS_COMENTARIO: 3,
    // Configuración general
    MARGEN_IMAGEN: 0,
    PADDING_DESCRIPCION: 3,
    MARGEN_PIE_PAGINA: 20,
    MAX_CARACTERES_POR_LINEA: 84,
    // Seguimientos
    ALTURA_SEGUIMIENTO_BASE: 28,
    ALTURA_EVIDENCIA_SEGUIMIENTO: 45,
    // Carga de imágenes
    MAX_PARALLEL_IMAGES: 3,
    IMAGE_TIMEOUT: 10000,
    MAX_IMAGE_SIZE: 10 * 1024 * 1024,
    // Espacios entre bloques
    ESPACIO_ENTRE_BLOQUES: 2,
    ESPACIO_ENTRE_BLOQUES_TITULO: 1,
    // Altura mínima cuando no hay comentario
    ALTURA_SIN_COMENTARIO: 10,
    ESPACIADO_IMAGEN_SIN_COMENTARIO: 3,
    // Altura del título de la sección de imágenes
    ALTURA_TITULO_SECCION_IMAGENES: 20,
    // Altura por línea de comentario
    ALTURA_POR_LINEA_COMENTARIO: 4.5
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
        
        this.configuracionCarta = {
            ancho: 215.9,
            alto: 279.4,
            margen: 20,
            alturaEncabezado: 42,
            alturaPie: 18
        };
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

    /**
     * Limita el texto del comentario a un máximo de caracteres y líneas
     * @param {string} comentario - Texto original
     * @returns {string} Texto truncado
     */
    limitarComentario(comentario) {
        if (!comentario) return '';
        
        let texto = comentario.trim();
        
        // Limitar por caracteres
        if (texto.length > CONFIG.MAX_CARACTERES_COMENTARIO) {
            texto = texto.substring(0, CONFIG.MAX_CARACTERES_COMENTARIO - 3) + '...';
        }
        
        return texto;
    }

    /**
     * Calcula la altura total que ocupará una imagen incluyendo su comentario
     * @param {Object} imagenObj - Objeto de imagen
     * @returns {number} Altura total en mm
     */
    calcularAlturaImagenConComentario(imagenObj) {
        const comentario = this.extraerComentario(imagenObj);
        const tieneComentario = comentario && comentario.trim() !== '';
        
        if (tieneComentario) {
            const comentarioLimitado = this.limitarComentario(comentario);
            const lineasComentario = this.dividirTextoPorCaracteres(comentarioLimitado, CONFIG.MAX_CARACTERES_COMENTARIO);
            const lineasAMostrar = Math.min(lineasComentario.length, CONFIG.MAX_LINEAS_COMENTARIO);
            // Altura: título "Descripción:" + líneas de texto + padding
            const alturaComentario = 8 + (lineasAMostrar * CONFIG.ALTURA_POR_LINEA_COMENTARIO);
            return CONFIG.ALTO_IMAGEN + CONFIG.ESPACIADO_COMENTARIO + alturaComentario;
        } else {
            return CONFIG.ALTO_IMAGEN + CONFIG.ESPACIADO_IMAGEN_SIN_COMENTARIO + CONFIG.ALTURA_SIN_COMENTARIO;
        }
    }
    
    /**
     * Calcula la altura máxima de una fila de imágenes
     * @param {Array} imagenesFila - Array de imágenes en la fila
     * @returns {number} Altura máxima de la fila en mm
     */
    calcularAlturaFila(imagenesFila) {
        let alturaMax = 0;
        for (const img of imagenesFila) {
            const altura = this.calcularAlturaImagenConComentario(img);
            alturaMax = Math.max(alturaMax, altura);
        }
        return alturaMax;
    }

    // =============================================
    // EXTRACCIÓN DE URL Y COMENTARIO
    // =============================================
    
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

    // =============================================
    // CARGA DE IMÁGENES
    // =============================================
    
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

    // =============================================
    // DIBUJAR IMAGEN EN PDF
    // =============================================
    
    async dibujarImagen(pdf, imagenObj, x, y, ancho, alto, numero, anchoDisponible = null) {
        try {
            const imgData = await this.obtenerImagen(imagenObj);
            let comentario = this.extraerComentario(imagenObj);
            comentario = this.limitarComentario(comentario);
            const tieneComentario = comentario && comentario.trim() !== '';
            
            pdf.saveGraphicsState();
            
            const margenImagen = CONFIG.MARGEN_IMAGEN;
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
            const yComentario = y + alto + CONFIG.ESPACIADO_COMENTARIO;
            
            let alturaRetornada;
            
            if (tieneComentario) {
                const lineasComentario = this.dividirTextoPorCaracteres(comentario, CONFIG.MAX_CARACTERES_COMENTARIO);
                const lineasAMostrar = Math.min(lineasComentario.length, CONFIG.MAX_LINEAS_COMENTARIO);
                const alturaComentario = 8 + (lineasAMostrar * CONFIG.ALTURA_POR_LINEA_COMENTARIO);
                
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, alturaComentario + 2, 'F');
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                pdf.text("Descripción:", xComentario + 3, yComentario + 4);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(80, 80, 80);
                
                let yTexto = yComentario + 4;
                for (let i = 0; i < lineasAMostrar; i++) {
                    pdf.text(lineasComentario[i], xComentario + 3, yTexto + (i * CONFIG.ALTURA_POR_LINEA_COMENTARIO) + 4);
                }
                
                alturaRetornada = alto + CONFIG.ESPACIADO_COMENTARIO + alturaComentario + 4;
            } else {
                pdf.setFillColor(252, 252, 252);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, CONFIG.ALTURA_SIN_COMENTARIO, 'F');
                
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(180, 180, 180);
                pdf.text("Sin descripción", xComentario + 3, yComentario + 3);
                
                alturaRetornada = alto + CONFIG.ESPACIADO_IMAGEN_SIN_COMENTARIO + CONFIG.ALTURA_SIN_COMENTARIO;
            }
            
            return {
                alturaUtilizada: alturaRetornada
            };
            
        } catch (error) {
            console.error(`Error dibujando imagen ${numero}:`, error);
            this.dibujarPlaceholder(pdf, x, y, ancho, alto, numero);
            return { alturaUtilizada: alto + CONFIG.ESPACIADO_IMAGEN_SIN_COMENTARIO + CONFIG.ALTURA_SIN_COMENTARIO };
        }
    }
    // Agregar este método a la clase IPHGenerator (después de dibujarImagen)

    /**
     * Versión optimizada para imágenes SIN descripción
     * Dibuja solo la imagen, sin el área de comentario
     */
    async dibujarImagenSinDescripcion(pdf, imagenObj, x, y, ancho, alto, numero) {
        try {
            const imgData = await this.obtenerImagen(imagenObj);
            
            pdf.saveGraphicsState();
            
            const margenImagen = CONFIG.MARGEN_IMAGEN;
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
            
        } catch (error) {
            console.error(`Error dibujando imagen ${numero}:`, error);
            this.dibujarPlaceholder(pdf, x, y, ancho, alto, numero);
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

    // =============================================
    // DIVIDIR TEXTO
    // =============================================
    
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

    // =============================================
    // DIBUJAR SEGUIMIENTO
    // =============================================
    
    async dibujarSeguimiento(pdf, seguimiento, x, y, ancho, numero) {
        const fecha = seguimiento.fecha ? this.formatearFechaVisualizacion(seguimiento.fecha) : 'Fecha no disponible';
        const usuario = seguimiento.usuarioNombre || 'Usuario';
        const descripcion = seguimiento.descripcion || 'Sin descripción';
        const evidencias = seguimiento.evidencias || [];
        
        let alturaTotal = CONFIG.ALTURA_SEGUIMIENTO_BASE;
        
        const lineasDescripcion = this.dividirTextoPorCaracteres(descripcion, CONFIG.MAX_CARACTERES_POR_LINEA - 10);
        const alturaDescripcion = Math.min(lineasDescripcion.length, 4) * CONFIG.ALTURA_LINEA;
        alturaTotal += alturaDescripcion;
        
        let alturaEvidencias = 0;
        if (evidencias.length > 0) {
            alturaEvidencias = CONFIG.ALTURA_EVIDENCIA_SEGUIMIENTO;
            alturaTotal += alturaEvidencias + 8;
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
        
        if (evidencias.length > 0) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini - 0.5);
            pdf.setTextColor(100, 100, 100);
            
            const anchoMiniatura = 30;
            const altoMiniatura = 25;
            const espaciadoMiniatura = 8;
            let xMiniatura = x + 6;
            const yMiniatura = yTexto + 10;
            
            for (let i = 0; i < Math.min(evidencias.length, 3); i++) {
                const evidencia = evidencias[i];
                const url = typeof evidencia === 'string' ? evidencia : evidencia.url;
                
                if (url) {
                    try {
                        const imgData = await this.obtenerImagen(url);
                        if (imgData) {
                            pdf.addImage(imgData, 'JPEG', xMiniatura, yMiniatura, anchoMiniatura, altoMiniatura, undefined, 'FAST');
                            pdf.setDrawColor(150, 150, 150);
                            pdf.setLineWidth(0.2);
                            pdf.rect(xMiniatura, yMiniatura, anchoMiniatura, altoMiniatura, 'S');
                        } else {
                            this.dibujarMiniaturaPlaceholder(pdf, xMiniatura, yMiniatura, anchoMiniatura, altoMiniatura, i + 1);
                        }
                    } catch (e) {
                        this.dibujarMiniaturaPlaceholder(pdf, xMiniatura, yMiniatura, anchoMiniatura, altoMiniatura, i + 1);
                    }
                } else {
                    this.dibujarMiniaturaPlaceholder(pdf, xMiniatura, yMiniatura, anchoMiniatura, altoMiniatura, i + 1);
                }
                
                xMiniatura += anchoMiniatura + espaciadoMiniatura;
            }
            
            if (evidencias.length > 3) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(120, 120, 120);
                pdf.text(`+${evidencias.length - 3} más`, xMiniatura + 5, yMiniatura + altoMiniatura / 2);
            }
        }
        
        pdf.restoreGraphicsState();
        
        return alturaTotal;
    }
    
    dibujarMiniaturaPlaceholder(pdf, x, y, ancho, alto, numero) {
        pdf.setFillColor(230, 230, 230);
        pdf.rect(x, y, ancho, alto, 'F');
        pdf.setDrawColor(180, 180, 180);
        pdf.rect(x, y, ancho, alto, 'S');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`[${numero}]`, x + ancho / 2, y + alto / 2, { align: 'center' });
    }

    // =============================================
    // MÉTODO PRINCIPAL
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
                // Pequeña pausa para que el usuario vea el mensaje
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            actualizarProgreso(50, 'Componiendo documento...');
            
            const pdf = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            this.totalPaginas = 1;
            this.paginaActualReal = 1;
            
            await this.generarPaginaOficial(pdf, incidencia, actualizarProgreso);
            
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
        let yPos = this.alturaEncabezado + 8;
        
        this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', incidencia.id || 'Nueva Incidencia');
        
        // =============================================
        // 1. IDENTIFICACIÓN DE LA UNIDAD
        // =============================================
        const alturaIdentificacion = 48;
        pdf.saveGraphicsState();
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text("1. IDENTIFICACIÓN DE LA UNIDAD", margen + 6, yPos + 6);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPos + 9, margen + anchoContenido - 4, yPos + 9);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(60, 60, 60);

        const organizacion = this.organizacionActual?.nombre || incidencia.organizacion || 'No especificada';
        pdf.text(`Organización: ${organizacion}`, margen + 6, yPos + 16);

        const sucursalNombre = incidencia.sucursalNombre || this.obtenerNombreSucursal(incidencia.sucursalId);
        pdf.text(`Sucursal: ${sucursalNombre}`, margen + 6, yPos + 24);

        const nombreReportante = incidencia.reportadoPorNombre || this.obtenerNombreUsuario(incidencia.reportadoPorId);
        pdf.text(`Reportado por: ${nombreReportante}`, margen + 6, yPos + 32);

        pdf.restoreGraphicsState();
        yPos += alturaIdentificacion + CONFIG.ESPACIO_ENTRE_BLOQUES;
        
        // =============================================
        // 2. DATOS GENERALES
        // =============================================
        const alturaGenerales = 32;
        pdf.saveGraphicsState();
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text("2. DATOS GENERALES", margen + 6, yPos + 6);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPos + 12, margen + anchoContenido - 4, yPos + 12);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(60, 60, 60);
        
        const fechaReporte = incidencia.fechaCreacion ? new Date(incidencia.fechaCreacion) : new Date();
        pdf.text(`Fecha de reporte: ${this.formatearFechaVisualizacion(fechaReporte)}`, margen + 6, yPos + 22);
        pdf.text(`Hora de reporte: ${this.formatearHoraVisualizacion(fechaReporte)}`, margen + 105, yPos + 22);
        
        pdf.restoreGraphicsState();
        yPos += alturaGenerales + CONFIG.ESPACIO_ENTRE_BLOQUES;
        
        // =============================================
        // 3. CLASIFICACIÓN DE LA INCIDENCIA
        // =============================================
        const alturaClasificacion = 72;
        pdf.saveGraphicsState();
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text("3. CLASIFICACIÓN DE LA INCIDENCIA", margen + 6, yPos + 6);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPos + 12, margen + anchoContenido - 4, yPos + 12);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        
        const categoriaNombre = incidencia.categoriaNombre || this.obtenerNombreCategoria(incidencia.categoriaId);
        pdf.text(`Categoría: ${categoriaNombre}`, margen + 6, yPos + 22);
        
        const subcategoriaNombre = incidencia.subcategoriaNombre || this.obtenerNombreSubcategoria(incidencia.subcategoriaId, incidencia.categoriaId);
        pdf.text(`Subcategoría: ${subcategoriaNombre}`, margen + 6, yPos + 30);
        
        const nivelRiesgo = incidencia.nivelRiesgo || 'No especificado';
        const riesgoTexto = typeof nivelRiesgo === 'string' ? nivelRiesgo.toUpperCase() : String(nivelRiesgo);
        
        let riesgoColor = [60, 60, 60];
        if (nivelRiesgo === 'critico') riesgoColor = [192, 57, 43];
        else if (nivelRiesgo === 'alto') riesgoColor = [230, 126, 34];
        else if (nivelRiesgo === 'medio') riesgoColor = [243, 156, 18];
        else if (nivelRiesgo === 'bajo') riesgoColor = [39, 174, 96];
        
        pdf.setTextColor(riesgoColor[0], riesgoColor[1], riesgoColor[2]);
        pdf.text(`Nivel de riesgo: ${riesgoTexto}`, margen + 6, yPos + 38);
        
        pdf.setTextColor(60, 60, 60);
        const estado = incidencia.estado || 'No especificado';
        pdf.text(`Estado: ${estado === 'pendiente' ? 'Pendiente de atención' : 'Finalizada'}`, margen + 6, yPos + 46);
        
        const fechaInicio = incidencia.fechaInicio ? new Date(incidencia.fechaInicio) : new Date();
        pdf.text(`Fecha del incidente: ${this.formatearFechaVisualizacion(fechaInicio)}`, margen + 6, yPos + 54);
        pdf.text(`Hora del incidente: ${this.formatearHoraVisualizacion(fechaInicio)}`, margen + 105, yPos + 54);
        
        pdf.restoreGraphicsState();
        yPos += alturaClasificacion + CONFIG.ESPACIO_ENTRE_BLOQUES;
        
        // =============================================
        // 4. DESCRIPCIÓN DE LOS HECHOS
        // =============================================
        const detalles = incidencia.detalles || 'No se proporcionó descripción.';
        const lineasDescripcion = this.dividirTextoPorCaracteres(detalles, CONFIG.MAX_CARACTERES_POR_LINEA);
        
        const ALTURA_TITULO = 16;
        const ALTURA_PADDING_SUPERIOR = 8;
        const ALTURA_PADDING_INFERIOR = 5;
        const ALTURA_POR_LINEA = CONFIG.ALTURA_LINEA;
        
        const alturaTextoNecesaria = lineasDescripcion.length * ALTURA_POR_LINEA;
        const alturaTotalNecesaria = ALTURA_TITULO + ALTURA_PADDING_SUPERIOR + alturaTextoNecesaria + ALTURA_PADDING_INFERIOR;
        
        const espacioDisponibleEnPagina = altoPagina - yPos - CONFIG.MARGEN_PIE_PAGINA;
        
        if (alturaTotalNecesaria <= espacioDisponibleEnPagina) {
            pdf.saveGraphicsState();
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(0, 0, 0);
            pdf.text("4. DESCRIPCIÓN DE LOS HECHOS", margen + 6, yPos + 6);
            pdf.setDrawColor(180, 180, 180);
            pdf.line(margen + 4, yPos + 12, margen + anchoContenido - 4, yPos + 12);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(60, 60, 60);
            
            let yTexto = yPos + ALTURA_PADDING_SUPERIOR + 8;
            for (let i = 0; i < lineasDescripcion.length; i++) {
                pdf.text(lineasDescripcion[i], margen + CONFIG.PADDING_DESCRIPCION, yTexto);
                yTexto += ALTURA_POR_LINEA;
            }
            
            pdf.restoreGraphicsState();
            yPos += alturaTotalNecesaria + CONFIG.ESPACIO_ENTRE_BLOQUES;
        } else {
            // Lógica de paginación para descripción larga
            const espacioParaTextoPrimera = espacioDisponibleEnPagina - ALTURA_TITULO - ALTURA_PADDING_SUPERIOR - ALTURA_PADDING_INFERIOR;
            const lineasQueCabenPrimera = Math.floor(espacioParaTextoPrimera / ALTURA_POR_LINEA);
            const lineasEnPrimeraPagina = Math.max(1, Math.min(lineasQueCabenPrimera, lineasDescripcion.length));
            
            const alturaTextoPrimera = lineasEnPrimeraPagina * ALTURA_POR_LINEA;
            const alturaRealPrimera = ALTURA_TITULO + ALTURA_PADDING_SUPERIOR + alturaTextoPrimera + ALTURA_PADDING_INFERIOR;
            
            pdf.saveGraphicsState();
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(0, 0, 0);
            pdf.text("4. DESCRIPCIÓN DE LOS HECHOS", margen + 6, yPos + 6);
            pdf.setDrawColor(180, 180, 180);
            pdf.line(margen + 4, yPos + 12, margen + anchoContenido - 4, yPos + 12);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(60, 60, 60);
            
            let yTextoPrimera = yPos + ALTURA_PADDING_SUPERIOR + 8;
            for (let i = 0; i < lineasEnPrimeraPagina; i++) {
                pdf.text(lineasDescripcion[i], margen + CONFIG.PADDING_DESCRIPCION, yTextoPrimera);
                yTextoPrimera += ALTURA_POR_LINEA;
            }
            
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(150, 150, 150);
            const lineasRestantes = lineasDescripcion.length - lineasEnPrimeraPagina;
            pdf.text(`(Continúa en la siguiente página... ${lineasRestantes} líneas restantes)`,
                     margen + 6, yPos + alturaRealPrimera - 5);
            pdf.restoreGraphicsState();
            
            yPos += alturaRealPrimera + CONFIG.ESPACIO_ENTRE_BLOQUES;
            this.dibujarPiePagina(pdf);
            pdf.addPage();
            this.paginaActualReal++;
            this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
            yPos = this.alturaEncabezado + 8;
            
            let indiceActual = lineasEnPrimeraPagina;
            
            while (indiceActual < lineasDescripcion.length) {
                const espacioNueva = altoPagina - yPos - CONFIG.MARGEN_PIE_PAGINA;
                const lineasQueCabenNueva = Math.floor((espacioNueva - ALTURA_TITULO - ALTURA_PADDING_SUPERIOR - ALTURA_PADDING_INFERIOR) / ALTURA_POR_LINEA);
                const lineasEnPaginaActual = Math.max(1, Math.min(lineasQueCabenNueva, lineasDescripcion.length - indiceActual));
                
                const alturaTextoActual = lineasEnPaginaActual * ALTURA_POR_LINEA;
                const alturaRealActual = ALTURA_TITULO + ALTURA_PADDING_SUPERIOR + alturaTextoActual + ALTURA_PADDING_INFERIOR;
                
                pdf.saveGraphicsState();
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.normal);
                pdf.setTextColor(0, 0, 0);
                pdf.text("4. DESCRIPCIÓN DE LOS HECHOS (Continuación)", margen + 6, yPos + 6);
                pdf.setDrawColor(180, 180, 180);
                pdf.line(margen + 4, yPos + 12, margen + anchoContenido - 4, yPos + 12);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.small);
                pdf.setTextColor(60, 60, 60);
                
                let yTextoActual = yPos + ALTURA_PADDING_SUPERIOR + 8;
                for (let i = 0; i < lineasEnPaginaActual; i++) {
                    pdf.text(lineasDescripcion[indiceActual + i], margen + CONFIG.PADDING_DESCRIPCION, yTextoActual);
                    yTextoActual += ALTURA_POR_LINEA;
                }
                
                if (indiceActual + lineasEnPaginaActual < lineasDescripcion.length) {
                    const restantes = lineasDescripcion.length - (indiceActual + lineasEnPaginaActual);
                    pdf.setFont('helvetica', 'italic');
                    pdf.setFontSize(this.fonts.mini);
                    pdf.setTextColor(150, 150, 150);
                    pdf.text(`(Continúa en la siguiente página... ${restantes} líneas restantes)`,
                             margen + 6, yPos + alturaRealActual - 5);
                }
                pdf.restoreGraphicsState();
                
                yPos += alturaRealActual + CONFIG.ESPACIO_ENTRE_BLOQUES;
                indiceActual += lineasEnPaginaActual;
                
                if (indiceActual < lineasDescripcion.length) {
                    this.dibujarPiePagina(pdf);
                    pdf.addPage();
                    this.paginaActualReal++;
                    this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
                    yPos = this.alturaEncabezado + 8;
                }
            }
        }

        // =============================================
        // 5. ANEXOS - EVIDENCIAS FOTOGRÁFICAS
        // NUEVO: Grid 2x2 con imágenes de 100x100
        // =============================================

        const imagenesPrincipales = incidencia.imagenes || [];

        if (imagenesPrincipales.length > 0) {
            // SEPARAR IMÁGENES POR SI TIENEN DESCRIPCIÓN O NO
            const imagenesSinDescripcion = [];
            const imagenesConDescripcion = [];
            
            for (const img of imagenesPrincipales) {
                const comentario = this.extraerComentario(img);
                const tieneComentario = comentario && comentario.trim() !== '';
                if (tieneComentario) {
                    imagenesConDescripcion.push(img);
                } else {
                    imagenesSinDescripcion.push(img);
                }
            }
            
            
            // CONFIGURACIÓN DE MÁRGENES CENTRADOS
            const margenContenido = margen + 6;
            const anchoUtilizable = anchoContenido - 12;
            
            // SECCIÓN 5A: IMÁGENES SIN DESCRIPCIÓN (4 POR PÁGINA - 2x2)
            if (imagenesSinDescripcion.length > 0) {
                const imgWidth = 88;
                const imgHeight = 75;
                const espaciadoHorizontal = 12;
                const espaciadoVertical = 15;
                
                const anchoTotalFilas = (imgWidth * 2) + espaciadoHorizontal;
                const inicioX = margenContenido + ((anchoUtilizable - anchoTotalFilas) / 2);
                
                const col1X = inicioX;
                const col2X = inicioX + imgWidth + espaciadoHorizontal;
                
                let imagenIndex = 0;
                
                const alturaTitulo = 18;
                const alturaFila = imgHeight + CONFIG.ESPACIADO_IMAGEN_SIN_COMENTARIO + CONFIG.ALTURA_SIN_COMENTARIO + 8;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.normal);
                pdf.setTextColor(0, 0, 0);
                pdf.text("5. EVIDENCIAS FOTOGRÁFICAS", margenContenido, yPos + 6);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text(`${imagenesSinDescripcion.length} imagen(es)`, anchoPagina - margenContenido - 30, yPos + 6);
                yPos += 18;
                
                while (imagenIndex < imagenesSinDescripcion.length) {
                    if (imagenIndex % 2 === 0 && !this.verificarEspacio(pdf, yPos, (alturaFila * 2) + espaciadoVertical + 10)) {
                        this.dibujarPiePagina(pdf);
                        pdf.addPage();
                        this.paginaActualReal++;
                        this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
                        yPos = this.alturaEncabezado + 5;
                        
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(this.fonts.normal);
                        pdf.setTextColor(0, 0, 0);
                        pdf.text("5. EVIDENCIAS FOTOGRÁFICAS (Continuación)", margenContenido, yPos + 6);
                        yPos += 18;
                    }
                    
                    // PRIMERA FILA
                    const imagenesFila1 = Math.min(2, imagenesSinDescripcion.length - imagenIndex);
                    for (let col = 0; col < imagenesFila1; col++) {
                        let xPos = col === 0 ? col1X : col2X;
                        const imagen = imagenesSinDescripcion[imagenIndex + col];
                        const numeroImagen = imagenIndex + col + 1;
                        
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(this.fonts.mini);
                        pdf.setTextColor(100, 100, 100);
                        pdf.text(`Imagen ${numeroImagen}`, xPos + 2, yPos - 3);
                        
                        await this.dibujarImagen(pdf, imagen, xPos, yPos, imgWidth, imgHeight, numeroImagen, imgWidth);
                    }
                    
                    yPos += alturaFila;
                    imagenIndex += imagenesFila1;
                    
                    // SEGUNDA FILA
                    if (imagenIndex < imagenesSinDescripcion.length) {
                        const imagenesFila2 = Math.min(2, imagenesSinDescripcion.length - imagenIndex);
                        
                        for (let col = 0; col < imagenesFila2; col++) {
                            let xPos = col === 0 ? col1X : col2X;
                            const imagen = imagenesSinDescripcion[imagenIndex + col];
                            const numeroImagen = imagenIndex + col + 1;
                            
                            pdf.setFont('helvetica', 'bold');
                            pdf.setFontSize(this.fonts.mini);
                            pdf.setTextColor(100, 100, 100);
                            pdf.text(`Imagen ${numeroImagen}`, xPos + 2, yPos - 3);
                            
                            await this.dibujarImagen(pdf, imagen, xPos, yPos, imgWidth, imgHeight, numeroImagen, imgWidth);
                        }
                        
                        yPos += alturaFila + espaciadoVertical;
                        imagenIndex += imagenesFila2;
                    }
                }
                yPos += 10;
            }
            
            // SECCIÓN 5B: IMÁGENES CON DESCRIPCIÓN (2 POR PÁGINA)
            if (imagenesConDescripcion.length > 0) {
                const imgWidth = 92;
                const imgHeight = 85;
                const espaciadoHorizontal = 14;
                
                const anchoTotalFilas = (imgWidth * 2) + espaciadoHorizontal;
                const inicioX = margenContenido + ((anchoUtilizable - anchoTotalFilas) / 2);
                
                const col1X = inicioX;
                const col2X = inicioX + imgWidth + espaciadoHorizontal;
                
                let imagenIndex = 0;
                let numeroBase = imagenesSinDescripcion.length;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.normal);
                pdf.setTextColor(0, 0, 0);
                pdf.text("6. EVIDENCIAS CON DESCRIPCIÓN", margenContenido, yPos + 6);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text(`${imagenesConDescripcion.length} imagen(es) con comentario`, anchoPagina - margenContenido - 60, yPos + 6);
                yPos += 18;
                
                while (imagenIndex < imagenesConDescripcion.length) {
                    const imagenesEnFila = Math.min(2, imagenesConDescripcion.length - imagenIndex);
                    
                    let alturaFila = 0;
                    for (let i = 0; i < imagenesEnFila; i++) {
                        const img = imagenesConDescripcion[imagenIndex + i];
                        const comentario = this.extraerComentario(img);
                        const lineasCom = this.dividirTextoPorCaracteres(comentario, CONFIG.MAX_CARACTERES_COMENTARIO);
                        const lineas = Math.min(lineasCom.length, 4);
                        const alturaExtra = CONFIG.ESPACIADO_COMENTARIO + 12 + Math.min(lineas * CONFIG.ALTURA_LINEA, 24);
                        alturaFila = Math.max(alturaFila, imgHeight + alturaExtra);
                    }
                    
                    if (!this.verificarEspacio(pdf, yPos, alturaFila + 15)) {
                        this.dibujarPiePagina(pdf);
                        pdf.addPage();
                        this.paginaActualReal++;
                        this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
                        yPos = this.alturaEncabezado + 5;
                        
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(this.fonts.normal);
                        pdf.setTextColor(0, 0, 0);
                        pdf.text("6. EVIDENCIAS CON DESCRIPCIÓN (Continuación)", margenContenido, yPos + 6);
                        yPos += 18;
                    }
                    
                    for (let col = 0; col < imagenesEnFila; col++) {
                        let xPos = col === 0 ? col1X : col2X;
                        const imagen = imagenesConDescripcion[imagenIndex + col];
                        const numeroImagen = numeroBase + imagenIndex + col + 1;
                        
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(this.fonts.mini);
                        pdf.setTextColor(100, 100, 100);
                        pdf.text(`Imagen ${numeroImagen}`, xPos + 2, yPos - 3);
                        
                        await this.dibujarImagen(pdf, imagen, xPos, yPos, imgWidth, imgHeight, numeroImagen, imgWidth);
                    }
                    
                    yPos += alturaFila + 12;
                    imagenIndex += imagenesEnFila;
                }
                yPos += 5;
            }
            
        } else {
            // SIN IMÁGENES - Mostrar mensaje amigable
            const alturaSinImagenes = 32;
            
            // Verificar espacio en la página
            if (!this.verificarEspacio(pdf, yPos, alturaSinImagenes + 10)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
                yPos = this.alturaEncabezado + 5;
            }
            
            pdf.saveGraphicsState();
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(0, 0, 0);
            pdf.text("5. EVIDENCIAS FOTOGRÁFICAS", margen + 6, yPos + 6);
            pdf.setDrawColor(180, 180, 180);
            pdf.line(margen + 4, yPos + 12, margen + anchoContenido - 4, yPos + 12);
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.small);
            pdf.setTextColor(120, 120, 120);
            pdf.text("No se adjuntaron evidencias fotográficas en este reporte.", margen + 6, yPos + 22);
            pdf.restoreGraphicsState();
            yPos += alturaSinImagenes + 8;
        }
        // =============================================
        // 6. HISTORIAL DE SEGUIMIENTOS
        // =============================================
        const seguimientos = incidencia.getSeguimientosArray ? incidencia.getSeguimientosArray() : [];
        
        if (seguimientos.length > 0) {
            if (!this.verificarEspacio(pdf, yPos, 20)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
                yPos = this.alturaEncabezado + 5;
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(0, 0, 0);
            pdf.text("6. HISTORIAL DE SEGUIMIENTOS", margen + 6, yPos + 6);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`${seguimientos.length} seguimiento(s) registrado(s)`, anchoPagina - margen - 50, yPos + 6);
            yPos += 18;
            
            for (let i = 0; i < seguimientos.length; i++) {
                const seguimiento = seguimientos[i];
                
                const alturaEstimada = CONFIG.ALTURA_SEGUIMIENTO_BASE + 20;
                if (!this.verificarEspacio(pdf, yPos, alturaEstimada + 10)) {
                    this.dibujarPiePagina(pdf);
                    pdf.addPage();
                    this.paginaActualReal++;
                    this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
                    yPos = this.alturaEncabezado + 5;
                    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(this.fonts.normal);
                    pdf.setTextColor(0, 0, 0);
                    pdf.text("6. HISTORIAL DE SEGUIMIENTOS (Continuación)", margen + 6, yPos + 6);
                    yPos += 18;
                }
                
                const alturaSeguimiento = await this.dibujarSeguimiento(pdf, seguimiento, margen, yPos, anchoContenido, i + 1);
                yPos += alturaSeguimiento + 8;
            }
            
            yPos += 5;
        }
        
        // AVISO DE PRIVACIDAD
        const alturaAviso = 36;
        if (yPos > altoPagina - alturaAviso - 15) {
            this.dibujarPiePagina(pdf);
            pdf.addPage();
            this.paginaActualReal++;
            this.dibujarEncabezadoBase(pdf, 'INFORME DE INCIDENCIA', `${incidencia.id} (Continuación)`);
            yPos = this.alturaEncabezado + 5;
        }
        
        pdf.saveGraphicsState();
        pdf.setFillColor(248, 248, 248);
        pdf.rect(margen, altoPagina - alturaAviso - 8, anchoContenido, alturaAviso, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(80, 80, 80);
        pdf.text("AVISO DE PRIVACIDAD", margen + 6, altoPagina - alturaAviso - 2);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        pdf.setTextColor(100, 100, 100);
        
        const aviso = "La información contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela y de la persona que ingresó los datos. Este reporte tiene carácter informativo y puede ser utilizado como medio de prueba ante las autoridades correspondientes.";
        const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 20);
        let yAviso = altoPagina - alturaAviso + 4;
        for (let i = 0; i < Math.min(lineasAviso.length, 3); i++) {
            pdf.text(lineasAviso[i], margen + 6, yAviso + (i * 4));
        }
        pdf.restoreGraphicsState();
        
        this.dibujarPiePagina(pdf);
    }
}

export const generadorIPH = new IPHGenerator();
export default generadorIPH;