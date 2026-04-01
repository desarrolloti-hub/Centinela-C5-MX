/**
 * IPH GENERATOR PARA SEGUIMIENTO - Sistema Centinela
 * VERSIÓN: 9.13 - DISEÑO ULTRA COMPACTO
 * 
 * Diseño extremadamente compacto para maximizar uso del papel.
 * Espacios reducidos al mínimo.
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
    ANCHO_IMAGEN: 85,
    ALTO_IMAGEN: 70,
    ESPACIADO_COLUMNAS: 8,
    ESPACIADO_FILAS: 10,
    MARGEN: 20,
    ALTURA_COMENTARIO: 14,
    ESPACIADO_COMENTARIO: 1,
    ALTURA_LINEA: 3.5,
    MARGEN_IMAGEN: 3,
    MARGEN_PIE_PAGINA: 12,
    MAX_CARACTERES_POR_LINEA: 88,
    MAX_CARACTERES_COMENTARIO: 48,
    ALTURA_SEGUIMIENTO_BASE: 18,
    ALTURA_EVIDENCIA_SEGUIMIENTO: 35,
    ESPACIO_ENTRE_BLOQUES: 1,
    ESPACIO_ENTRE_BLOQUES_TITULO: 0,
    // Configuración de imágenes
    MAX_PARALLEL_IMAGES: 3,
    IMAGE_TIMEOUT: 10000,
    MAX_IMAGE_SIZE: 10 * 1024 * 1024
};

class IPHGeneratorSeguimiento extends PDFBaseGenerator {
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
            alturaEncabezado: 32,
            alturaPie: 12
        };
    }

    async initStorage() {
        console.log('✅ IPHSeguimiento listo');
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
    
    async cargarImagenMultiEstrategia(url) {
        const urlNormalizada = this.normalizarUrl(url);
        
        if (!this.esUrlValida(urlNormalizada)) {
            console.warn('❌ URL inválida:', urlNormalizada);
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
        
        console.log(`📸 Precargando ${itemsValidos.length} imágenes...`);
        
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
        
        console.log(`✅ Precarga completada: ${itemsValidos.length} imágenes procesadas`);
    }
    
    async obtenerImagen(item) {
        const url = this.extraerUrlImagen(item);
        if (!url) return null;
        return await this.cargarImagenMultiEstrategia(url);
    }

    async dibujarImagen(pdf, imagenObj, x, y, ancho, alto, numero, anchoDisponible = null) {
        try {
            const imgData = await this.obtenerImagen(imagenObj);
            const comentario = this.extraerComentario(imagenObj);
            
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
            
            if (comentario && comentario.trim() !== '') {
                const lineasComentario = this.dividirTextoPorCaracteres(comentario, CONFIG.MAX_CARACTERES_COMENTARIO);
                const alturaComentario = Math.min(lineasComentario.length * CONFIG.ALTURA_LINEA, CONFIG.ALTURA_COMENTARIO);
                
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, alturaComentario + 1, 'F');
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.mini - 0.5);
                pdf.setTextColor(80, 80, 80);
                pdf.text("Desc:", xComentario + 2, yComentario + 2);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.mini - 0.5);
                pdf.setTextColor(80, 80, 80);
                
                let yTexto = yComentario + 2;
                const lineasAMostrar = Math.min(lineasComentario.length, 2);
                for (let i = 0; i < lineasAMostrar; i++) {
                    pdf.text(lineasComentario[i], xComentario + 2, yTexto + (i * CONFIG.ALTURA_LINEA) + 2);
                }
                
                if (lineasComentario.length > 2) {
                    pdf.setFont('helvetica', 'italic');
                    pdf.text("(...)", xComentario + 2, yTexto + 15);
                }
                
                return {
                    alturaUtilizada: alto + CONFIG.ESPACIADO_COMENTARIO + alturaComentario + 2
                };
            } else {
                pdf.setFillColor(250, 250, 250);
                pdf.rect(xComentario, yComentario - 1, anchoTexto, 5, 'F');
                
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini - 1);
                pdf.setTextColor(150, 150, 150);
                pdf.text("--", xComentario + 2, yComentario + 2);
                
                return {
                    alturaUtilizada: alto + CONFIG.ESPACIADO_COMENTARIO + 6
                };
            }
            
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

    async dibujarSeguimiento(pdf, seguimiento, x, y, ancho, numero) {
        const fecha = seguimiento.fecha ? this.formatearFechaVisualizacion(seguimiento.fecha) : 'Fecha no disponible';
        const usuario = seguimiento.usuarioNombre || 'Usuario';
        const descripcion = seguimiento.descripcion || 'Sin descripción';
        const evidencias = seguimiento.evidencias || [];
        
        let alturaTotal = CONFIG.ALTURA_SEGUIMIENTO_BASE;
        
        const lineasDescripcion = this.dividirTextoPorCaracteres(descripcion, CONFIG.MAX_CARACTERES_POR_LINEA - 10);
        const alturaDescripcion = Math.min(lineasDescripcion.length, 3) * CONFIG.ALTURA_LINEA;
        alturaTotal += alturaDescripcion;
        
        let alturaEvidencias = 0;
        if (evidencias.length > 0) {
            alturaEvidencias = CONFIG.ALTURA_EVIDENCIA_SEGUIMIENTO;
            alturaTotal += alturaEvidencias + 4;
        }
        
        pdf.saveGraphicsState();
        pdf.setFillColor(248, 248, 248);
        pdf.rect(x, y, ancho, alturaTotal, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small - 0.5);
        pdf.setTextColor(60, 60, 60);
        pdf.text(`${usuario}`, x + 4, y + 4);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        pdf.setTextColor(100, 100, 100);
        pdf.text(fecha, x + ancho - 4, y + 4, { align: 'right' });
        
        pdf.setDrawColor(220, 220, 220);
        pdf.line(x + 4, y + 8, x + ancho - 4, y + 8);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        pdf.setTextColor(80, 80, 80);
        
        let yTexto = y + 11;
        const lineasAMostrar = Math.min(lineasDescripcion.length, 3);
        for (let i = 0; i < lineasAMostrar; i++) {
            pdf.text(lineasDescripcion[i], x + 4, yTexto);
            yTexto += CONFIG.ALTURA_LINEA;
        }
        
        if (lineasDescripcion.length > 3) {
            pdf.setFont('helvetica', 'italic');
            pdf.text("...", x + 4, yTexto);
            yTexto += CONFIG.ALTURA_LINEA;
        }
        
        if (evidencias.length > 0) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini - 1);
            pdf.setTextColor(100, 100, 100);
           // pdf.text(`[${evidencias.length}]`, x + 4, yTexto + 2);
            
            const anchoMiniatura = 28;
            const altoMiniatura = 22;
            const espaciadoMiniatura = 6;
            let xMiniatura = x + 20;
            const yMiniatura = yTexto;
            
            for (let i = 0; i < Math.min(evidencias.length, 3); i++) {
                const evidencia = evidencias[i];
                const url = typeof evidencia === 'string' ? evidencia : this.extraerUrlImagen(evidencia);
                
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
        pdf.setFontSize(5);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`[${numero}]`, x + ancho / 2, y + alto / 2, { align: 'center' });
    }

    async generarIPHSeguimiento(incidencia, opciones = {}) {
        try {
            const { 
                mostrarAlerta = true, 
                tituloAlerta = 'Generando informe actualizado...', 
                onProgress = null,
                returnBlob = false,
                diagnosticar = false
            } = opciones;
            
            if (diagnosticar) {
                console.log('📋 GENERANDO INFORME DE SEGUIMIENTO');
                console.log('  Folio:', incidencia.id);
                console.log('  Imágenes originales:', incidencia.imagenes?.length || 0);
                console.log('  Seguimientos:', incidencia.getSeguimientosArray?.()?.length || 0);
            }
            
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
            }
            
            actualizarProgreso(50, 'Componiendo documento...');
            
            const pdf = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            this.totalPaginas = 1;
            this.paginaActualReal = 1;
            
            await this.generarPaginaOficial(pdf, incidencia, actualizarProgreso);
            
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
        
        this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', incidencia.id || 'Nueva Incidencia');
        
        // =============================================
        // 1. IDENTIFICACIÓN DE LA UNIDAD
        // =============================================
        pdf.saveGraphicsState();
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text("1. IDENTIFICACIÓN", margen + 4, yPos + 3);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPos + 6, margen + anchoContenido - 4, yPos + 6);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small - 0.5);
        pdf.setTextColor(60, 60, 60);

        const organizacion = this.organizacionActual?.nombre || incidencia.organizacion || 'No especificada';
        pdf.text(`Org: ${organizacion}`, margen + 4, yPos + 11);

        const sucursalNombre = incidencia.sucursalNombre || this.obtenerNombreSucursal(incidencia.sucursalId);
        pdf.text(`Suc: ${sucursalNombre}`, margen + 4, yPos + 16);

        const nombreReportante = incidencia.reportadoPorNombre || this.obtenerNombreUsuario(incidencia.reportadoPorId) || incidencia.creadoPorNombre || 'No especificado';
        pdf.text(`Reporta: ${nombreReportante}`, margen + 4, yPos + 21);

        pdf.restoreGraphicsState();
        yPos += 26;
        
        // =============================================
        // 2. DATOS GENERALES
        // =============================================
        pdf.saveGraphicsState();
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text("2. DATOS", margen + 4, yPos + 3);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPos + 8, margen + anchoContenido - 4, yPos + 8);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small - 0.5);
        pdf.setTextColor(60, 60, 60);
        
        const fechaReporte = incidencia.fechaCreacion ? new Date(incidencia.fechaCreacion) : new Date();
        pdf.text(`Fecha: ${this.formatearFechaVisualizacion(fechaReporte)}`, margen + 4, yPos + 15);
        pdf.text(`Hora: ${this.formatearHoraVisualizacion(fechaReporte)}`, margen + 100, yPos + 15);
        
        pdf.restoreGraphicsState();
        yPos += 22;
        
        // =============================================
        // 3. CLASIFICACIÓN
        // =============================================
        pdf.saveGraphicsState();
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal - 1);
        pdf.setTextColor(0, 0, 0);
        pdf.text("3. CLASIFICACIÓN", margen + 4, yPos + 3);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margen + 4, yPos + 8, margen + anchoContenido - 4, yPos + 8);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small - 0.5);
        
        const categoriaNombre = incidencia.categoriaNombre || this.obtenerNombreCategoria(incidencia.categoriaId);
        pdf.text(`Cat: ${categoriaNombre}`, margen + 4, yPos + 15);
        
        const subcategoriaNombre = incidencia.subcategoriaNombre || this.obtenerNombreSubcategoria(incidencia.subcategoriaId, incidencia.categoriaId);
        pdf.text(`Sub: ${subcategoriaNombre}`, margen + 4, yPos + 20);
        
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
        pdf.text(`Fecha: ${this.formatearFechaVisualizacion(fechaInicio)}`, margen + 4, yPos + 35);
        pdf.text(`Hora: ${this.formatearHoraVisualizacion(fechaInicio)}`, margen + 100, yPos + 35);
        
        pdf.restoreGraphicsState();
        yPos += 42;
        
        // =============================================
        // 4. DESCRIPCIÓN
        // =============================================
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
            pdf.line(margen + 4, yPos + 8, margen + anchoContenido - 4, yPos + 8);
            
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
            // Lógica de paginación simplificada
            const espacioParaTextoPrimera = espacioDisponibleEnPagina - ALTURA_TITULO - ALTURA_PADDING_SUPERIOR - ALTURA_PADDING_INFERIOR;
            const lineasQueCabenPrimera = Math.floor(espacioParaTextoPrimera / ALTURA_POR_LINEA);
            const lineasEnPrimeraPagina = Math.max(1, Math.min(lineasQueCabenPrimera, lineasDescripcion.length));
            
            const alturaTextoPrimera = lineasEnPrimeraPagina * ALTURA_POR_LINEA;
            const alturaRealPrimera = ALTURA_TITULO + ALTURA_PADDING_SUPERIOR + alturaTextoPrimera + ALTURA_PADDING_INFERIOR;
            
            pdf.saveGraphicsState();
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal - 1);
            pdf.setTextColor(0, 0, 0);
            pdf.text("4. DESCRIPCIÓN", margen + 4, yPos + 3);
            pdf.setDrawColor(180, 180, 180);
            pdf.line(margen + 4, yPos + 8, margen + anchoContenido - 4, yPos + 8);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.small - 0.5);
            pdf.setTextColor(60, 60, 60);
            
            let yTextoPrimera = yPos + ALTURA_PADDING_SUPERIOR + 6;
            for (let i = 0; i < lineasEnPrimeraPagina; i++) {
                pdf.text(lineasDescripcion[i], margen + 4, yTextoPrimera);
                yTextoPrimera += ALTURA_POR_LINEA;
            }
            
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini - 1);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`(continúa)`, margen + 4, yPos + alturaRealPrimera - 2);
            pdf.restoreGraphicsState();
            
            yPos += alturaRealPrimera + CONFIG.ESPACIO_ENTRE_BLOQUES;
            this.dibujarPiePagina(pdf);
            pdf.addPage();
            this.paginaActualReal++;
            this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
            yPos = this.alturaEncabezado + 4;
            
            let indiceActual = lineasEnPrimeraPagina;
            
            while (indiceActual < lineasDescripcion.length) {
                const espacioNueva = altoPagina - yPos - CONFIG.MARGEN_PIE_PAGINA;
                const lineasQueCabenNueva = Math.floor((espacioNueva - ALTURA_TITULO - ALTURA_PADDING_SUPERIOR - ALTURA_PADDING_INFERIOR) / ALTURA_POR_LINEA);
                const lineasEnPaginaActual = Math.max(1, Math.min(lineasQueCabenNueva, lineasDescripcion.length - indiceActual));
                
                const alturaTextoActual = lineasEnPaginaActual * ALTURA_POR_LINEA;
                const alturaRealActual = ALTURA_TITULO + ALTURA_PADDING_SUPERIOR + alturaTextoActual + ALTURA_PADDING_INFERIOR;
                
                pdf.saveGraphicsState();
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.normal - 1);
                pdf.setTextColor(0, 0, 0);
                pdf.text("4. DESCRIPCIÓN (cont.)", margen + 4, yPos + 3);
                pdf.setDrawColor(180, 180, 180);
                pdf.line(margen + 4, yPos + 8, margen + anchoContenido - 4, yPos + 8);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(this.fonts.small - 0.5);
                pdf.setTextColor(60, 60, 60);
                
                let yTextoActual = yPos + ALTURA_PADDING_SUPERIOR + 6;
                for (let i = 0; i < lineasEnPaginaActual; i++) {
                    pdf.text(lineasDescripcion[indiceActual + i], margen + 4, yTextoActual);
                    yTextoActual += ALTURA_POR_LINEA;
                }
                
                if (indiceActual + lineasEnPaginaActual < lineasDescripcion.length) {
                    pdf.setFont('helvetica', 'italic');
                    pdf.setFontSize(this.fonts.mini - 1);
                    pdf.setTextColor(150, 150, 150);
                    pdf.text(`(continúa)`, margen + 4, yPos + alturaRealActual - 2);
                }
                pdf.restoreGraphicsState();
                
                yPos += alturaRealActual + CONFIG.ESPACIO_ENTRE_BLOQUES;
                indiceActual += lineasEnPaginaActual;
                
                if (indiceActual < lineasDescripcion.length) {
                    this.dibujarPiePagina(pdf);
                    pdf.addPage();
                    this.paginaActualReal++;
                    this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
                    yPos = this.alturaEncabezado + 4;
                }
            }
        }
        
        // =============================================
        // 5. EVIDENCIAS ORIGINALES
        // =============================================
        const imagenesPrincipales = incidencia.imagenes || [];
        
        if (imagenesPrincipales.length > 0) {
            const imgWidth = CONFIG.ANCHO_IMAGEN;
            const imgHeight = CONFIG.ALTO_IMAGEN;
            
            let col1X = margen + 4;
            let col2X = col1X + imgWidth + CONFIG.ESPACIADO_COLUMNAS;
            let col3X = col2X + imgWidth + CONFIG.ESPACIADO_COLUMNAS;
            
            let numColumnas = 2;
            if (anchoContenido >= (imgWidth * 3) + (CONFIG.ESPACIADO_COLUMNAS * 2)) {
                numColumnas = 3;
            }
            
            let imagenIndex = 0;
            
            if (!this.verificarEspacio(pdf, yPos, 20)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
                yPos = this.alturaEncabezado + 4;
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal - 1);
            pdf.setTextColor(0, 0, 0);
            pdf.text("5. EVIDENCIAS ORIGINALES", margen + 4, yPos + 3);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.mini - 1);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`${imagenesPrincipales.length}`, anchoPagina - margen - 15, yPos + 3);
            yPos += 12;
            
            while (imagenIndex < imagenesPrincipales.length) {
                const imagenesEnFila = Math.min(numColumnas, imagenesPrincipales.length - imagenIndex);
                let alturaFila = 0;
                
                for (let i = 0; i < imagenesEnFila; i++) {
                    const img = imagenesPrincipales[imagenIndex + i];
                    const comentario = this.extraerComentario(img);
                    let alturaExtra = CONFIG.ESPACIADO_COMENTARIO + 8;
                    if (comentario && comentario.trim() !== '') {
                        const lineasCom = this.dividirTextoPorCaracteres(comentario, CONFIG.MAX_CARACTERES_COMENTARIO);
                        const lineas = Math.min(lineasCom.length, 2);
                        alturaExtra += Math.min(lineas * CONFIG.ALTURA_LINEA, 12);
                    } else {
                        alturaExtra += 4;
                    }
                    alturaFila = Math.max(alturaFila, imgHeight + alturaExtra);
                }
                
                if (!this.verificarEspacio(pdf, yPos, alturaFila + 8)) {
                    this.dibujarPiePagina(pdf);
                    pdf.addPage();
                    this.paginaActualReal++;
                    this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
                    yPos = this.alturaEncabezado + 4;
                    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(this.fonts.normal - 1);
                    pdf.setTextColor(0, 0, 0);
                    pdf.text("5. EVIDENCIAS ORIGINALES (cont.)", margen + 4, yPos + 3);
                    yPos += 12;
                }
                
                for (let col = 0; col < imagenesEnFila; col++) {
                    let xPos = col1X;
                    if (col === 1) xPos = col2X;
                    if (col === 2) xPos = col3X;
                    
                    const imagen = imagenesPrincipales[imagenIndex + col];
                    const numeroImagen = imagenIndex + col + 1;
                    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(this.fonts.mini - 1);
                    pdf.setTextColor(100, 100, 100);
                    pdf.text(`${numeroImagen}`, xPos + 2, yPos - 2);
                    
                    await this.dibujarImagen(pdf, imagen, xPos, yPos, imgWidth, imgHeight, numeroImagen, imgWidth);
                    
                    if (onProgress) {
                        onProgress(50 + (imagenIndex / imagenesPrincipales.length) * 25);
                    }
                }
                
                yPos += alturaFila + CONFIG.ESPACIADO_FILAS;
                imagenIndex += imagenesEnFila;
            }
            yPos += 2;
        } else {
            if (!this.verificarEspacio(pdf, yPos, 22)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
                yPos = this.alturaEncabezado + 4;
            }
            
            pdf.saveGraphicsState();
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal - 1);
            pdf.setTextColor(0, 0, 0);
            pdf.text("5. EVIDENCIAS ORIGINALES", margen + 4, yPos + 3);
            pdf.setDrawColor(180, 180, 180);
            pdf.line(margen + 4, yPos + 8, margen + anchoContenido - 4, yPos + 8);
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.small - 1);
            pdf.setTextColor(120, 120, 120);
            pdf.text("Sin evidencias", margen + 4, yPos + 15);
            pdf.restoreGraphicsState();
            yPos += 24;
        }
        
        // =============================================
        // 6. SEGUIMIENTOS
        // =============================================
        const seguimientos = incidencia.getSeguimientosArray ? incidencia.getSeguimientosArray() : [];
        
        if (seguimientos.length > 0) {
            if (!this.verificarEspacio(pdf, yPos, 15)) {
                this.dibujarPiePagina(pdf);
                pdf.addPage();
                this.paginaActualReal++;
                this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
                yPos = this.alturaEncabezado + 4;
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal - 1);
            pdf.setTextColor(0, 0, 0);
            pdf.text("6. SEGUIMIENTOS", margen + 4, yPos + 3);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(this.fonts.mini - 1);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`${seguimientos.length}`, anchoPagina - margen - 15, yPos + 3);
            yPos += 12;
            
            for (let i = 0; i < seguimientos.length; i++) {
                const seguimiento = seguimientos[i];
                
                const alturaEstimada = CONFIG.ALTURA_SEGUIMIENTO_BASE + 12;
                if (!this.verificarEspacio(pdf, yPos, alturaEstimada + 5)) {
                    this.dibujarPiePagina(pdf);
                    pdf.addPage();
                    this.paginaActualReal++;
                    this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
                    yPos = this.alturaEncabezado + 4;
                    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(this.fonts.normal - 1);
                    pdf.setTextColor(0, 0, 0);
                    pdf.text("6. SEGUIMIENTOS (cont.)", margen + 4, yPos + 3);
                    yPos += 12;
                }
                
                const alturaSeguimiento = await this.dibujarSeguimiento(pdf, seguimiento, margen, yPos, anchoContenido, i + 1);
                yPos += alturaSeguimiento + 4;
            }
            
            yPos += 2;
        }
        
        // AVISO DE PRIVACIDAD (compacto)
        const alturaAviso = 24;
        if (yPos > altoPagina - alturaAviso - 5) {
            this.dibujarPiePagina(pdf);
            pdf.addPage();
            this.paginaActualReal++;
            this.dibujarEncabezadoBase(pdf, 'INFORME DE SEGUIMIENTO', `${incidencia.id} (Cont.)`);
            yPos = this.alturaEncabezado + 4;
        }
        
        pdf.saveGraphicsState();
        pdf.setFillColor(248, 248, 248);
        pdf.rect(margen, altoPagina - alturaAviso - 3, anchoContenido, alturaAviso, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini - 1);
        pdf.setTextColor(80, 80, 80);
        pdf.text("AVISO", margen + 4, altoPagina - alturaAviso);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 1);
        pdf.setTextColor(100, 100, 100);
        
        const aviso = "Documento informativo del Sistema Centinela. Puede ser utilizado como medio de prueba.";
        const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 15);
        let yAviso = altoPagina - alturaAviso + 3;
        for (let i = 0; i < Math.min(lineasAviso.length, 2); i++) {
            pdf.text(lineasAviso[i], margen + 4, yAviso + (i * 3));
        }
        pdf.restoreGraphicsState();
        
        this.dibujarPiePagina(pdf);
    }
}

export const generadorIPHSeguimiento = new IPHGeneratorSeguimiento();
export default generadorIPHSeguimiento;