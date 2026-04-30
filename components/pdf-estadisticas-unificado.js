/**
 * PDF ESTADÍSTICAS UNIFICADO - Sistema Centinela
 * VERSIÓN: 18.4 - CORREGIDO CON MAPA DE CALOR SIN SOMBRAS
 * - Contador de páginas dinámico
 * - Tablas con mejor distribución de columnas
 * - Truncamiento mejorado para nombres largos
 * - Mapa de calor sin círculos de sombra (basado en versión 9.0)
 */

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

export const coloresUnificados = {
    ...coloresBase,
    graficas: {
        actualizadores: '#3b82f6',
        reportadores: '#10b981',
        seguimientos: '#f97316',
        estadoPendiente: '#f59e0b',
        estadoFinalizada: '#10b981',
        riesgoCritico: '#ef4444',
        riesgoAlto: '#f97316',
        riesgoMedio: '#eab308',
        riesgoBajo: '#10b981',
        categorias: '#8b5cf6',
        sucursales: '#14b8a6',
        tiempo: '#ec4899',
        perdidas: '#ef4444',
        recuperaciones: '#10b981',
        robo: '#ef4444',
        extravio: '#f59e0b',
        accidente: '#3b82f6',
        otro: '#8b5cf6',
        topSucursales: '#FF6600'
    }
};

const GRID_CONFIG = {
    MARGEN_PAGINA: 15,
    ANCHO_PAGINA: 297,
    ALTO_PAGINA: 210,
    ALTURA_ENCABEZADO: 38,
    ALTURA_PIE: 15
};

class PDFEstadisticasUnificadoGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        this.metricasIncidencias = null;
        this.estadisticasRecuperacion = null;
        this.sucursalesRecuperacion = [];
        this.filtrosAplicados = {};
        this.fechaInicio = null;
        this.fechaFin = null;
        this.tablasData = {};
        this.topActualizadores = [];
        this.topReportadores = [];
        this.topSeguimientos = [];
        this.sucursalesCache = [];
        this.categoriasCache = [];

        this.capturas = {
            actualizadores: null,
            reportadores: null,
            seguimientos: null,
            estado: null,
            riesgo: null,
            categorias: null,
            sucursalesIncidencias: null,
            tiempoResolucion: null,
            tipoEvento: null,
            evolucionMensual: null,
            topSucursalesRecuperacion: null,
            comparativa: null,
            mapaCalor: null,
            graficoTopUbicaciones: null
        };

        this.fonts = {
            tituloPrincipal: 16,
            titulo: 13,
            subtitulo: 11,
            normal: 10,
            small: 9,
            mini: 8,
            micro: 7
        };

        // Contador dinámico de páginas
        this.totalPaginas = 0;
        this.paginaActualReal = 0;
    }

    configurar(config) {
        if (config.organizacionActual) this.organizacionActual = config.organizacionActual;
        if (config.sucursalesCache) this.sucursalesCache = config.sucursalesCache;
        if (config.categoriasCache) this.categoriasCache = config.categoriasCache;
        if (config.authToken) this.authToken = config.authToken;
    }

    async capturarGraficas() {
        const canvasIds = [
            { id: 'graficoActualizadores', key: 'actualizadores', nombre: 'Actualizadores' },
            { id: 'graficoReportadores', key: 'reportadores', nombre: 'Reportadores' },
            { id: 'graficoSeguimientos', key: 'seguimientos', nombre: 'Seguimientos' },
            { id: 'graficoEstado', key: 'estado', nombre: 'Estado' },
            { id: 'graficoRiesgo', key: 'riesgo', nombre: 'Riesgo' },
            { id: 'graficoCategorias', key: 'categorias', nombre: 'Categorias' },
            { id: 'graficoSucursales', key: 'sucursalesIncidencias', nombre: 'Sucursales' },
            { id: 'graficoTiempo', key: 'tiempoResolucion', nombre: 'Tiempo resolucion' },
            { id: 'graficoTipoEvento', key: 'tipoEvento', nombre: 'Tipo evento' },
            { id: 'graficoEvolucionMensual', key: 'evolucionMensual', nombre: 'Evolucion mensual' },
            { id: 'graficoTopSucursales', key: 'topSucursalesRecuperacion', nombre: 'Top sucursales' },
            { id: 'graficoComparativa', key: 'comparativa', nombre: 'Comparativa' }
        ];

        for (const item of canvasIds) {
            const canvas = document.getElementById(item.id);
            if (canvas && canvas instanceof HTMLCanvasElement) {
                try {
                    const scale = 3;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width * scale;
                    tempCanvas.height = canvas.height * scale;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.scale(scale, scale);
                    tempCtx.drawImage(canvas, 0, 0);
                    this.capturas[item.key] = tempCanvas.toDataURL('image/png', 1.0);
                } catch (error) {
                    this.capturas[item.key] = null;
                }
            }
        }

        // ========== CAPTURA DEL MAPA DE CALOR - SOLO OCULTAR LOS CÍRCULOS GRANDES ==========
        const mapaElement = document.getElementById('mapaCalorComponente');
        if (mapaElement && mapaElement instanceof HTMLElement) {
            try {
                if (typeof html2canvas !== 'undefined') {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Buscar SOLO los círculos grandes (los que tienen fill-opacity="0.15" o radio grande)
                    const todosLosPaths = mapaElement.querySelectorAll('path');
                    const estilosOriginales = [];

                    todosLosPaths.forEach(path => {
                        // Verificar si es un círculo grande (no un marcador)
                        // Los círculos de calor tienen fill-opacity ~0.15 y stroke-opacity ~0.4
                        const fillOpacity = path.getAttribute('fill-opacity');
                        const strokeOpacity = path.getAttribute('stroke-opacity');
                        const radioMatch = path.getAttribute('d')?.match(/a(\d+),(\d+)/i);
                        const radio = radioMatch ? parseInt(radioMatch[1]) : 0;

                        // Si tiene fill-opacity bajo (0.15) y radio grande (>30), es un círculo de calor
                        if ((fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) && radio > 30) {
                            estilosOriginales.push({
                                elemento: path,
                                fillOpacity: fillOpacity,
                                strokeOpacity: strokeOpacity
                            });
                            // Ocultar SOLO estos círculos
                            path.setAttribute('fill-opacity', '0');
                            path.setAttribute('stroke-opacity', '0');
                        }
                    });

                    // También buscar círculos marcadores con fill-opacity 0.15
                    const circulosMarcadores = mapaElement.querySelectorAll('circle');
                    circulosMarcadores.forEach(circle => {
                        const fillOpacity = circle.getAttribute('fill-opacity');
                        if (fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) {
                            estilosOriginales.push({
                                elemento: circle,
                                fillOpacity: fillOpacity,
                                strokeOpacity: circle.getAttribute('stroke-opacity')
                            });
                            circle.setAttribute('fill-opacity', '0');
                            circle.setAttribute('stroke-opacity', '0');
                        }
                    });

                    await new Promise(resolve => setTimeout(resolve, 50));

                    const canvas = await html2canvas(mapaElement, {
                        scale: 2.5,
                        backgroundColor: '#1a1a2e',
                        useCORS: true,
                        logging: false,
                        onclone: (clonedDoc, element) => {
                            // En el clon, también ocultar SOLO los círculos de calor
                            const clonedPaths = clonedDoc.querySelectorAll('path');
                            clonedPaths.forEach(path => {
                                const fillOpacity = path.getAttribute('fill-opacity');
                                const radioMatch = path.getAttribute('d')?.match(/a(\d+),(\d+)/i);
                                const radio = radioMatch ? parseInt(radioMatch[1]) : 0;
                                if ((fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) && radio > 30) {
                                    path.setAttribute('fill-opacity', '0');
                                    path.setAttribute('stroke-opacity', '0');
                                }
                            });

                            const clonedCircles = clonedDoc.querySelectorAll('circle');
                            clonedCircles.forEach(circle => {
                                const fillOpacity = circle.getAttribute('fill-opacity');
                                if (fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) {
                                    circle.setAttribute('fill-opacity', '0');
                                    circle.setAttribute('stroke-opacity', '0');
                                }
                            });
                        }
                    });

                    // Restaurar los círculos
                    estilosOriginales.forEach(original => {
                        if (original.fillOpacity) original.elemento.setAttribute('fill-opacity', original.fillOpacity);
                        if (original.strokeOpacity) original.elemento.setAttribute('stroke-opacity', original.strokeOpacity);
                    });

                    this.capturas.mapaCalor = canvas.toDataURL('image/png', 1.0);
                }
            } catch (error) {
                console.error('Error capturando mapa de calor:', error);
                this.capturas.mapaCalor = null;
            }
        }

        const graficoTopMapa = document.getElementById('mapaGraficoTop');
        if (graficoTopMapa && graficoTopMapa instanceof HTMLCanvasElement) {
            try {
                const scale = 3;
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = graficoTopMapa.width * scale;
                tempCanvas.height = graficoTopMapa.height * scale;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.scale(scale, scale);
                tempCtx.drawImage(graficoTopMapa, 0, 0);
                this.capturas.graficoTopUbicaciones = tempCanvas.toDataURL('image/png', 1.0);
            } catch (error) { }
        }
    }

    configurarDatos(datos) {
        this.metricasIncidencias = datos.metricasIncidencias || null;
        this.estadisticasRecuperacion = datos.datosRecuperacion?.estadisticas || null;
        this.sucursalesRecuperacion = datos.datosRecuperacion?.sucursalesResumen || [];
        this.tablasData = datos.tablasData || {};
        this.topActualizadores = datos.datosIncidencias?.topActualizadores || [];
        this.topReportadores = datos.datosIncidencias?.topReportadores || [];
        this.topSeguimientos = datos.datosIncidencias?.topSeguimientos || [];

        if (datos.filtrosAplicados) {
            this.filtrosAplicados = datos.filtrosAplicados;
            this.fechaInicio = datos.filtrosAplicados.fechaInicio;
            this.fechaFin = datos.filtrosAplicados.fechaFin;
        }

        // Calcular total de páginas dinámicamente
        this._calcularTotalPaginas();
    }

    _calcularTotalPaginas() {
        // Páginas base
        let paginasBase = 15; // Páginas fijas del reporte

        // Agregar páginas extra si hay datos adicionales
        let paginasExtra = 0;

        // Si hay muchas sucursales, podríamos necesitar páginas extra
        if (this.sucursalesRecuperacion && this.sucursalesRecuperacion.length > 15) {
            paginasExtra += Math.ceil((this.sucursalesRecuperacion.length - 15) / 20);
        }

        // Si hay muchos colaboradores
        const totalColaboradores = (this.topActualizadores?.length || 0) +
            (this.topReportadores?.length || 0) +
            (this.topSeguimientos?.length || 0);
        if (totalColaboradores > 30) {
            paginasExtra += 1;
        }

        this.totalPaginas = paginasBase + paginasExtra;
    }

    async generarReporte(datos, mostrarAlerta = true) {
        try {
            this.configurarDatos(datos);

            if (mostrarAlerta) {
                Swal.fire({
                    title: 'Generando Reporte PDF...',
                    html: `<p>Capturando graficas...</p>`,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => Swal.showLoading()
                });
            }

            await this.capturarGraficas();
            await this.cargarLibrerias();
            await this.cargarLogoCentinela();
            await this.cargarLogoOrganizacion();

            const pdf = new this.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            this.paginaActualReal = 1;

            await this._generarContenido(pdf);

            const fechaStr = this.formatearFechaArchivo();
            const nombreArchivo = `ESTADISTICAS_UNIFICADO_${this.organizacionActual?.nombre || 'organizacion'}_${fechaStr}.pdf`;

            if (mostrarAlerta) {
                Swal.close();
                await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            }

            return pdf;

        } catch (error) {
            console.error('Error generando reporte:', error);
            if (mostrarAlerta) {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'Error', text: error.message });
            }
            throw error;
        }
    }

    // Método mejorado para truncar texto - respeta guiones y maneja mejor nombres largos
    _truncarTextoParaColumna(texto, anchoColumnaMM, fontSize, esNombrePropio = false) {
        if (!texto) return '';
        const textoStr = String(texto);

        // Límite variable según el tipo de contenido
        let maxChars;

        if (esNombrePropio) {
            // Los nombres propios pueden tener más caracteres
            if (fontSize <= 7) maxChars = 25;
            else if (fontSize <= 8) maxChars = 22;
            else if (fontSize <= 9) maxChars = 20;
            else maxChars = 18;
        } else {
            // Valores numéricos o categorías
            if (fontSize <= 7) maxChars = 15;
            else if (fontSize <= 8) maxChars = 14;
            else if (fontSize <= 9) maxChars = 12;
            else maxChars = 10;
        }

        // Ajuste por ancho de columna
        if (anchoColumnaMM < 25) {
            maxChars = Math.min(maxChars, 14);
        }

        // Si es nombre propio y es largo, intentar preservar palabras completas
        if (esNombrePropio && textoStr.length > maxChars) {
            // Buscar un espacio o guión para cortar más limpio
            let lastSpace = -1;
            for (let i = maxChars - 3; i > 0; i--) {
                if (textoStr[i] === ' ' || textoStr[i] === '-') {
                    lastSpace = i;
                    break;
                }
            }
            if (lastSpace > maxChars - 8) {
                return textoStr.substring(0, lastSpace) + '…';
            }
        }

        if (textoStr.length <= maxChars) return textoStr;
        return textoStr.substring(0, maxChars - 2) + '…';
    }

    // Método mejorado para calcular ancho de columnas dinámicamente
    _calcularAnchosColumnas(pdf, columnas, datos, anchoTotal) {
        const anchos = {};
        const espacioTotal = anchoTotal - 8; // Restar padding
        let pesoTotal = 0;

        // Calcular pesos según el tipo de columna
        const pesos = {};
        for (const col of columnas) {
            // Columna de nombre debe ser más ancha
            if (col.toLowerCase().includes('colaborador') ||
                col.toLowerCase().includes('sucursal') ||
                col.toLowerCase().includes('nombre') ||
                col.toLowerCase().includes('categoria')) {
                pesos[col] = 3;
            }
            // Columnas numéricas más angostas
            else if (col.toLowerCase().includes('cantidad') ||
                col.toLowerCase().includes('tiempo') ||
                col.toLowerCase().includes('%')) {
                pesos[col] = 1.5;
            }
            // Columnas de estado/riesgo medianas
            else if (col.toLowerCase().includes('estado') ||
                col.toLowerCase().includes('riesgo') ||
                col.toLowerCase().includes('nivel')) {
                pesos[col] = 2;
            }
            else {
                pesos[col] = 2;
            }
            pesoTotal += pesos[col];
        }

        // Calcular anchos basados en pesos
        for (const col of columnas) {
            anchos[col] = (espacioTotal * pesos[col]) / pesoTotal;
        }

        return anchos;
    }

    async _generarContenido(pdf) {
        // PAGINA 1: KPIs Incidencias + Filtros
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', this.organizacionActual?.nombre || 'SISTEMA CENTINELA');
        let yPos = this.alturaEncabezado + 5;
        yPos = this._dibujarFiltrosCompactos(pdf, yPos);
        yPos += 3;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('SECCION 1: INCIDENCIAS - METRICAS GENERALES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 120, yPos - 2);

        if (this.metricasIncidencias) {
            yPos = this._dibujarMetricasIncidencias(pdf, this.metricasIncidencias, yPos + 2);
        }

        yPos += 2;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1.1 DESEMPENO DE COLABORADORES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        await this._dibujarTresGraficasPagina1(pdf, [
            { titulo: 'Actualizaciones', imagen: this.capturas.actualizadores },
            { titulo: 'Reportes', imagen: this.capturas.reportadores },
            { titulo: 'Seguimientos', imagen: this.capturas.seguimientos }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 2: TABLAS colaboradores
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'TABLAS - COLABORADORES');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1.2 DETALLE DE COLABORADORES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        this._dibujarTresTablasPagina2(pdf, [
            { titulo: 'Actualizaciones', datos: this.topActualizadores, columnas: ['Colaborador', 'Cantidad'] },
            { titulo: 'Reportes', datos: this.topReportadores, columnas: ['Colaborador', 'Cantidad'] },
            { titulo: 'Seguimientos', datos: this.topSeguimientos, columnas: ['Colaborador', 'Cantidad'] }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 3: Graficas Estado, Riesgo, Categorias
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'GRAFICAS - ESTADO Y RIESGO');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1.3 ESTADO, RIESGO Y CATEGORIAS', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        await this._dibujarTresGraficasPagina3(pdf, [
            { titulo: 'Estado', imagen: this.capturas.estado, esCircular: true },
            { titulo: 'Niveles de Riesgo', imagen: this.capturas.riesgo, esCircular: true },
            { titulo: 'Categorias', imagen: this.capturas.categorias }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 4: TABLAS Estado, Riesgo, Categorias
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'TABLAS - ESTADO Y RIESGO');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1.4 DETALLE DE ESTADO, RIESGO Y CATEGORIAS', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        this._dibujarTresTablasPagina4(pdf, [
            { titulo: 'Estado', datos: this.tablasData.estadoDetalle || [], columnas: ['Estado', 'Cantidad', '%'] },
            { titulo: 'Niveles Riesgo', datos: this.tablasData.riesgoDetalle || [], columnas: ['Nivel', 'Cantidad', '%'] },
            { titulo: 'Categorias', datos: this.tablasData.categoriasDetalle || [], columnas: ['Categoria', 'Cantidad'] }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 5: Graficas Sucursales y Tiempo
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'GRAFICAS - SUCURSALES Y TIEMPO');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1.5 INCIDENCIAS POR SUCURSAL Y TIEMPO', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        await this._dibujarDosGraficasPagina5(pdf, [
            { titulo: 'Incidencias por Sucursal', imagen: this.capturas.sucursalesIncidencias },
            { titulo: 'Tiempo de Resolucion', imagen: this.capturas.tiempoResolucion }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 6: TABLAS Sucursales y Tiempo
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'TABLAS - SUCURSALES Y TIEMPO');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1.6 DETALLE DE SUCURSALES Y TIEMPO', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        this._dibujarDosTablasPagina6(pdf, [
            { titulo: 'Sucursales', datos: this.tablasData.sucursalesData || [], columnas: ['Sucursal', 'Incidencias'] },
            { titulo: 'Tiempo Resolucion', datos: this.tablasData.tiemposPromedio || [], columnas: ['Colaborador', 'Tiempo (días)'] }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 7: KPIs Recuperacion + Graficas
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'RECUPERACION - METRICAS');
        yPos = this.alturaEncabezado + 5;
        yPos = this._dibujarFiltrosCompactos(pdf, yPos);
        yPos += 3;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('SECCION 2: RECUPERACION - METRICAS', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 120, yPos - 2);

        if (this.estadisticasRecuperacion) {
            yPos = this._dibujarKPIsRecuperacion(pdf, this.estadisticasRecuperacion, yPos + 2);
        }

        yPos += 2;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('2.1 DISTRIBUCION Y EVOLUCION', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        await this._dibujarDosGraficasPagina7(pdf, [
            { titulo: 'Tipo de Evento', imagen: this.capturas.tipoEvento, esCircular: true },
            { titulo: 'Evolucion Mensual', imagen: this.capturas.evolucionMensual }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 8: TABLAS Tipo Evento y Evolucion
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'TABLAS - DISTRIBUCION');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('2.2 DETALLE POR TIPO DE EVENTO Y EVOLUCION', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        this._dibujarDosTablasPagina8(pdf, [
            { titulo: 'Tipo de Evento', datos: this.tablasData.tipoEvento || [], columnas: ['Tipo', 'Monto', '%'] },
            { titulo: 'Evolucion Mensual', datos: this.tablasData.evolucionMensual || [], columnas: ['Mes', 'Perdido', 'Recuperado', 'Tasa'] }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 9: Graficas Top Sucursales y Comparativa
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'GRAFICAS - COMPARATIVO');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('2.3 TOP SUCURSALES Y COMPARATIVA', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        await this._dibujarDosGraficasPagina9(pdf, [
            { titulo: 'Top Sucursales', imagen: this.capturas.topSucursalesRecuperacion },
            { titulo: 'Perdida vs Recuperacion', imagen: this.capturas.comparativa }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 10: TABLAS Top Sucursales y Comparativa
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'TABLAS - COMPARATIVO');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('2.4 DETALLE TOP SUCURSALES Y COMPARATIVA', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        this._dibujarDosTablasPagina10(pdf, [
            { titulo: 'Top Sucursales', datos: this.tablasData.topSucursales || [], columnas: ['Sucursal', 'Perdido', 'Eventos'] },
            { titulo: 'Comparativa', datos: this.tablasData.comparativa || [], columnas: ['Concepto', 'Monto', '%'] }
        ], yPos);

        this.dibujarPiePagina(pdf);

        // PAGINA 11: Resumen por sucursal
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'RECUPERACION - RESUMEN');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('2.5 RESUMEN POR SUCURSAL', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;

        this._dibujarTablaResumen(pdf, this.sucursalesRecuperacion, yPos);
        this.dibujarPiePagina(pdf);

        // PAGINA 12: Desempeno colaboradores
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'DESEMPENO');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('3. DESEMPENO DE COLABORADORES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 8;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 3, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 3);
        yPos += 10;

        this._dibujarTablaGrande(pdf, this.tablasData.colaboradoresTabla || [], 'Desempeno de colaboradores',
            ['Colaborador', 'Reportes', 'Actualiz.', 'Seguim.', 'Tiempo', 'Efic.'], yPos, 130);

        this.dibujarPiePagina(pdf);

        // PAGINA 13: Incidencias por categoria (PÁGINA SEPARADA)
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'INCIDENCIAS POR CATEGORIA');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('3.1 INCIDENCIAS POR CATEGORIA', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 8;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 3, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 3);
        yPos += 10;

        this._dibujarTablaCategoriasGrande(pdf, this.tablasData.categoriasDesempeno || [], 'Incidencias por categoria',
            ['Categoria', 'Cantidad'], yPos, 130);

        this.dibujarPiePagina(pdf);

        // PAGINA 14: Mapa de calor
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'MAPA DE CALOR');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('4. MAPA DE CALOR - DISTRIBUCION GEOGRAFICA', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 8;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 3, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 3);
        yPos += 10;

        await this._dibujarMapaCalor(pdf, yPos);
        this.dibujarPiePagina(pdf);

        // PAGINA 15: Top ubicaciones
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADISTICO UNIFICADO', 'TOP UBICACIONES');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('5. TOP UBICACIONES CON MAS INCIDENTES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 8;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 3, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 3);
        yPos += 10;

        await this._dibujarGraficoTopUbicacionesConAviso(pdf, yPos);
        this._dibujarAvisoPrivacidadIntegrado(pdf);
        this.dibujarPiePagina(pdf);
    }

    // =============================================
    // METODOS DE GRAFICAS COMPACTAS
    // =============================================

    async _dibujarTresGraficasPagina1(pdf, graficas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 20) / 3;
        const altoGrafica = 68;
        const espacio = 10;

        for (let i = 0; i < graficas.length; i++) {
            const g = graficas[i];
            const x = margen + (i * (anchoGrafica + espacio));
            await this._dibujarGraficaMini(pdf, g.titulo, g.imagen, x, yInicio, anchoGrafica, altoGrafica);
        }
    }

    async _dibujarTresGraficasPagina3(pdf, graficas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 20) / 3;
        const altoGrafica = 75;
        const espacio = 10;

        for (let i = 0; i < graficas.length; i++) {
            const g = graficas[i];
            const x = margen + (i * (anchoGrafica + espacio));
            if (g.esCircular) {
                await this._dibujarGraficaCircularMini(pdf, g.titulo, g.imagen, x, yInicio, anchoGrafica, altoGrafica);
            } else {
                await this._dibujarGraficaMini(pdf, g.titulo, g.imagen, x, yInicio, anchoGrafica, altoGrafica);
            }
        }
    }

    async _dibujarDosGraficasPagina5(pdf, graficas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 15) / 2;
        const altoGrafica = 85;
        const espacio = 15;

        for (let i = 0; i < graficas.length; i++) {
            const g = graficas[i];
            const x = margen + (i * (anchoGrafica + espacio));
            await this._dibujarGraficaMini(pdf, g.titulo, g.imagen, x, yInicio, anchoGrafica, altoGrafica);
        }
    }

    async _dibujarDosGraficasPagina7(pdf, graficas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 15) / 2;
        const altoGrafica = 80;
        const espacio = 15;

        for (let i = 0; i < graficas.length; i++) {
            const g = graficas[i];
            const x = margen + (i * (anchoGrafica + espacio));
            if (g.esCircular) {
                await this._dibujarGraficaCircularMini(pdf, g.titulo, g.imagen, x, yInicio, anchoGrafica, altoGrafica);
            } else {
                await this._dibujarGraficaMini(pdf, g.titulo, g.imagen, x, yInicio, anchoGrafica, altoGrafica);
            }
        }
    }

    async _dibujarDosGraficasPagina9(pdf, graficas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 15) / 2;
        const altoGrafica = 85;
        const espacio = 15;

        for (let i = 0; i < graficas.length; i++) {
            const g = graficas[i];
            const x = margen + (i * (anchoGrafica + espacio));
            await this._dibujarGraficaMini(pdf, g.titulo, g.imagen, x, yInicio, anchoGrafica, altoGrafica);
        }
    }

    async _dibujarGraficoTopUbicacionesConAviso(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const anchoGrafica = anchoPagina - (margen * 2);
        const altoGrafica = altoPagina - yPos - 48;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoGrafica, altoGrafica, 4, 4, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Top 10 ubicaciones con mas incidentes', margen + 6, yPos + 8);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 6, yPos + 13, margen + anchoGrafica - 6, yPos + 13);

        const graficaX = margen + 8;
        const graficaY = yPos + 20;
        const graficaAncho = anchoGrafica - 16;
        const graficaAlto = altoGrafica - 30;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (this.capturas.graficoTopUbicaciones) {
            try {
                pdf.addImage(this.capturas.graficoTopUbicaciones, 'PNG', graficaX + 2, graficaY + 2, graficaAncho - 4, graficaAlto - 4, undefined, 'FAST');
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.normal);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar la grafica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos de ubicaciones', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    async _dibujarGraficaMini(pdf, titulo, imagen, x, y, ancho, alto) {
        const alturaTitulo = 10;
        const tituloLimpio = this._limpiarTexto(titulo);

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.3);
        pdf.line(x + 4, y + alturaTitulo - 1, x + ancho - 4, y + alturaTitulo - 1);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(tituloLimpio, x + (ancho / 2), y + 4, { align: 'center' });

        const graficaY = y + alturaTitulo + 2;
        const graficaAlto = alto - alturaTitulo - 6;

        if (imagen) {
            try {
                pdf.addImage(imagen, 'PNG', x + 3, graficaY + 1, ancho - 6, graficaAlto - 2, undefined, 'FAST');
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.micro);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error', x + (ancho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', x + (ancho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    async _dibujarGraficaCircularMini(pdf, titulo, imagen, x, y, ancho, alto) {
        const alturaTitulo = 10;
        const tituloLimpio = this._limpiarTexto(titulo);

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.3);
        pdf.line(x + 4, y + alturaTitulo - 1, x + ancho - 4, y + alturaTitulo - 1);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(tituloLimpio, x + (ancho / 2), y + 4, { align: 'center' });

        const graficaY = y + alturaTitulo + 2;
        const graficaAlto = alto - alturaTitulo - 4;
        const graficaAncho = Math.min(ancho - 10, graficaAlto);

        if (imagen) {
            try {
                pdf.addImage(imagen, 'PNG', x + (ancho - graficaAncho) / 2, graficaY + 1, graficaAncho - 2, graficaAlto - 2, undefined, 'FAST');
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.micro);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error', x + (ancho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', x + (ancho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    async _dibujarMapaCalor(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const anchoMapa = anchoPagina - (margen * 2);
        const altoMapa = altoPagina - yPos - 25;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoMapa, altoMapa, 4, 4, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Distribucion geografica de incidentes por nivel de riesgo', margen + 6, yPos + 8);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 6, yPos + 13, margen + anchoMapa - 6, yPos + 13);

        const mapaX = margen + 5;
        const mapaY = yPos + 20;
        const mapaAncho = anchoMapa - 10;
        const mapaAlto = altoMapa - 35;

        pdf.setFillColor(0, 0, 0);
        pdf.rect(mapaX, mapaY, mapaAncho, mapaAlto, 'F');

        if (this.capturas.mapaCalor) {
            try {
                pdf.addImage(this.capturas.mapaCalor, 'PNG', mapaX + 2, mapaY + 2, mapaAncho - 4, mapaAlto - 4, undefined, 'FAST');
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.normal);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar el mapa', mapaX + (mapaAncho / 2), mapaY + (mapaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos de mapa de calor', mapaX + (mapaAncho / 2), mapaY + (mapaAlto / 2), { align: 'center' });
        }

        const leyendaY = yPos + altoMapa - 12;
        const coloresLeyenda = [
            { color: '#ef4444', nombre: 'Critico' },
            { color: '#f97316', nombre: 'Alto' },
            { color: '#eab308', nombre: 'Medio' },
            { color: '#10b981', nombre: 'Bajo' }
        ];
        const anchoCuadro = 10;
        const espacioEntreItems = 32;
        const inicioXleyenda = margen + (anchoMapa / 2) - ((coloresLeyenda.length * espacioEntreItems) / 2);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);

        for (let i = 0; i < coloresLeyenda.length; i++) {
            const item = coloresLeyenda[i];
            const itemX = inicioXleyenda + (i * espacioEntreItems);
            pdf.setFillColor(item.color);
            pdf.rect(itemX, leyendaY, anchoCuadro, anchoCuadro, 'F');
            pdf.text(item.nombre, itemX + anchoCuadro + 4, leyendaY + 7);
        }
    }

    // =============================================
    // METODOS DE TABLAS MEJORADOS
    // =============================================

    _dibujarTresTablasPagina2(pdf, tablas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = (anchoPagina - (margen * 2) - 20) / 3;
        const espacio = 10;
        let maxY = yInicio;

        for (let i = 0; i < tablas.length; i++) {
            const t = tablas[i];
            const x = margen + (i * (anchoTabla + espacio));
            const yFinal = this._dibujarTablaCompacta(pdf, t.datos, t.titulo, x, yInicio, anchoTabla, t.columnas, 95);
            if (yFinal > maxY) maxY = yFinal;
        }
        return maxY;
    }

    _dibujarTresTablasPagina4(pdf, tablas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = (anchoPagina - (margen * 2) - 20) / 3;
        const espacio = 10;
        let maxY = yInicio;

        for (let i = 0; i < tablas.length; i++) {
            const t = tablas[i];
            const x = margen + (i * (anchoTabla + espacio));
            const yFinal = this._dibujarTablaCompacta(pdf, t.datos, t.titulo, x, yInicio, anchoTabla, t.columnas, 100);
            if (yFinal > maxY) maxY = yFinal;
        }
        return maxY;
    }

    _dibujarDosTablasPagina6(pdf, tablas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = (anchoPagina - (margen * 2) - 15) / 2;
        const espacio = 15;
        let maxY = yInicio;

        for (let i = 0; i < tablas.length; i++) {
            const t = tablas[i];
            const x = margen + (i * (anchoTabla + espacio));
            const yFinal = this._dibujarTablaCompacta(pdf, t.datos, t.titulo, x, yInicio, anchoTabla, t.columnas, 100);
            if (yFinal > maxY) maxY = yFinal;
        }
        return maxY;
    }

    _dibujarDosTablasPagina8(pdf, tablas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = (anchoPagina - (margen * 2) - 15) / 2;
        const espacio = 15;
        let maxY = yInicio;

        for (let i = 0; i < tablas.length; i++) {
            const t = tablas[i];
            const x = margen + (i * (anchoTabla + espacio));
            const yFinal = this._dibujarTablaCompacta(pdf, t.datos, t.titulo, x, yInicio, anchoTabla, t.columnas, 105);
            if (yFinal > maxY) maxY = yFinal;
        }
        return maxY;
    }

    _dibujarDosTablasPagina10(pdf, tablas, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = (anchoPagina - (margen * 2) - 15) / 2;
        const espacio = 15;
        let maxY = yInicio;

        for (let i = 0; i < tablas.length; i++) {
            const t = tablas[i];
            const x = margen + (i * (anchoTabla + espacio));
            const yFinal = this._dibujarTablaCompacta(pdf, t.datos, t.titulo, x, yInicio, anchoTabla, t.columnas, 105);
            if (yFinal > maxY) maxY = yFinal;
        }
        return maxY;
    }

    _dibujarTablaResumen(pdf, datos, yInicio) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = anchoPagina - (margen * 2);
        this._dibujarTablaCompacta(pdf, datos, 'Resumen por sucursal', margen, yInicio, anchoTabla,
            ['Sucursal', 'Eventos', 'Perdido', 'Recuperado', 'Neta', '%'], 110);
    }

    // Tabla compacta mejorada con distribución inteligente de columnas
    _dibujarTablaCompacta(pdf, datos, titulo, x, y, ancho, columnas, altoMax = 100) {
        const tituloLimpio = this._limpiarTexto(titulo);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text(tituloLimpio, x + 4, y + 5);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.3);
        pdf.line(x + 4, y + 9, x + ancho - 4, y + 9);

        if (!datos || datos.length === 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', x + (ancho / 2), y + 30, { align: 'center' });
            return y + 45;
        }

        // Calcular anchos de columnas dinámicamente
        const anchosColumnas = this._calcularAnchosColumnas(pdf, columnas, datos, ancho);
        const xInicio = x + 4;
        let yActual = y + 14;
        const altoFila = 6.5;

        // Encabezado
        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yActual - 4, ancho - 8, altoFila + 1.5, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);

        let xColActual = xInicio + 3;
        for (let i = 0; i < columnas.length; i++) {
            const columnaLimpia = this._limpiarTexto(columnas[i]);
            pdf.text(columnaLimpia, xColActual, yActual);
            xColActual += anchosColumnas[columnas[i]];
        }

        yActual += altoFila + 1.5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        const filasMostrar = Math.min(datos.length, 14);

        for (let i = 0; i < filasMostrar; i++) {
            const item = datos[i];
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yActual - 3.5, ancho - 8, altoFila + 1.5, 'F');
            }

            xColActual = xInicio + 3;
            const valores = Object.values(item);

            for (let j = 0; j < Math.min(valores.length, columnas.length); j++) {
                let texto = String(valores[j] || '');
                const esNombre = columnas[j].toLowerCase().includes('colaborador') ||
                    columnas[j].toLowerCase().includes('sucursal') ||
                    columnas[j].toLowerCase().includes('nombre');

                texto = this._truncarTextoParaColumna(texto, anchosColumnas[columnas[j]], this.fonts.micro, esNombre);
                pdf.text(texto, xColActual, yActual);
                xColActual += anchosColumnas[columnas[j]];
            }
            yActual += altoFila + 1.5;
        }

        return yActual;
    }

    _dibujarTablaGrande(pdf, datos, titulo, columnas, yInicio, altoMax = 130) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = anchoPagina - (margen * 2);

        return this._dibujarTablaGenericaGrande(pdf, datos, titulo, margen, yInicio, anchoTabla, columnas, altoMax);
    }

    _dibujarTablaCategoriasGrande(pdf, datos, titulo, columnas, yInicio, altoMax = 130) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = anchoPagina - (margen * 2);

        return this._dibujarTablaGenericaGrande(pdf, datos, titulo, margen, yInicio, anchoTabla, columnas, altoMax);
    }

    // Tabla grande mejorada con distribución inteligente de columnas
    _dibujarTablaGenericaGrande(pdf, datos, titulo, x, y, ancho, columnas, altoMax = 130) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + 5, y + 6);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 5, y + 10, x + ancho - 5, y + 10);

        if (!datos || datos.length === 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos para mostrar', x + (ancho / 2), y + 35, { align: 'center' });
            return y + 50;
        }

        const anchosColumnas = this._calcularAnchosColumnas(pdf, columnas, datos, ancho);
        const xInicio = x + 5;
        let yActual = y + 16;
        const altoFila = 8;

        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yActual - 4, ancho - 10, altoFila + 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);

        let xColActual = xInicio + 4;
        for (let i = 0; i < columnas.length; i++) {
            pdf.text(columnas[i], xColActual, yActual);
            xColActual += anchosColumnas[columnas[i]];
        }

        yActual += altoFila + 2;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        const filasMostrar = Math.min(datos.length, Math.floor(altoMax / (altoFila + 2)));

        for (let i = 0; i < filasMostrar; i++) {
            const item = datos[i];
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yActual - 3.5, ancho - 10, altoFila + 1.5, 'F');
            }

            xColActual = xInicio + 4;
            const valores = Object.values(item);

            for (let j = 0; j < Math.min(valores.length, columnas.length); j++) {
                let texto = String(valores[j] || '');
                const esNombre = columnas[j].toLowerCase().includes('colaborador') ||
                    columnas[j].toLowerCase().includes('sucursal') ||
                    columnas[j].toLowerCase().includes('nombre') ||
                    columnas[j].toLowerCase().includes('categoria');

                texto = this._truncarTextoParaColumna(texto, anchosColumnas[columnas[j]], this.fonts.micro, esNombre);
                pdf.text(texto, xColActual, yActual);
                xColActual += anchosColumnas[columnas[j]];
            }
            yActual += altoFila + 2;
        }

        if (datos.length > filasMostrar) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`* Mostrando ${filasMostrar} de ${datos.length} registros`, x + 5, yActual + 4);
            yActual += 8;
        }

        return yActual;
    }

    // =============================================
    // METODOS BASE
    // =============================================

    _dibujarFiltrosCompactos(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);

        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoContenido, 9, 2, 2, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        pdf.text('FILTROS:', margen + 5, yPos + 3.5);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        let filtroText = '';
        if (this.fechaInicio && this.fechaFin) {
            filtroText += `${this.formatearFechaVisualizacion(new Date(this.fechaInicio))} - ${this.formatearFechaVisualizacion(new Date(this.fechaFin))}`;
        } else {
            filtroText += 'Todo el historial';
        }
        filtroText += ' | ';
        if (this.filtrosAplicados.sucursalId && this.filtrosAplicados.sucursalId !== 'todas') {
            const sucursal = this.sucursalesCache.find(s => s.id === this.filtrosAplicados.sucursalId);
            filtroText += `Sucursal: ${sucursal?.nombre || this.filtrosAplicados.sucursalId}`;
        } else {
            filtroText += 'Todas las sucursales';
        }
        filtroText += ' | ';
        if (this.filtrosAplicados.categoriaId && this.filtrosAplicados.categoriaId !== 'todas') {
            const categoria = this.categoriasCache.find(c => c.id === this.filtrosAplicados.categoriaId);
            filtroText += `Categoria: ${categoria?.nombre || 'Filtrada'}`;
        } else {
            filtroText += 'Todas las categorias';
        }

        filtroText = this._limpiarTexto(filtroText);
        if (filtroText.length > 75) filtroText = filtroText.substring(0, 72) + '...';
        pdf.text(filtroText, margen + 40, yPos + 3.5);

        return yPos + 11;
    }

    _dibujarMetricasIncidencias(pdf, metricas, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoMetrica = (anchoPagina - (margen * 2) - 15) / 4;
        const espacio = 5;

        const metricasArray = [
            { titulo: 'CRITICAS', valor: metricas.criticas || 0, color: [239, 68, 68] },
            { titulo: 'ALTAS', valor: metricas.altas || 0, color: [249, 115, 22] },
            { titulo: 'PENDIENTES', valor: metricas.pendientes || 0, color: [245, 158, 11] },
            { titulo: 'TOTAL', valor: metricas.total || 0, color: [59, 130, 246] }
        ];

        for (let i = 0; i < metricasArray.length; i++) {
            const met = metricasArray[i];
            const xMetrica = margen + (i * (anchoMetrica + espacio));

            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xMetrica, yPos, anchoMetrica, 30, 3, 3, 'FD');

            pdf.setFillColor(met.color[0], met.color[1], met.color[2]);
            pdf.rect(xMetrica, yPos, anchoMetrica, 3, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(0, 0, 0);
            pdf.text(met.titulo, xMetrica + 4, yPos + 10);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(met.color[0], met.color[1], met.color[2]);
            pdf.text(met.valor.toString(), xMetrica + 4, yPos + 25);
        }

        return yPos + 34;
    }

    _dibujarKPIsRecuperacion(pdf, estadisticas, yPos) {
        if (!estadisticas) return yPos;

        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoKPI = (anchoPagina - (margen * 2) - 20) / 6;
        const espacio = 4;
        const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });

        const kpis = [
            { titulo: 'Perdido', valor: estadisticas.totalPerdido || 0, color: [239, 68, 68] },
            { titulo: 'Recuperado', valor: estadisticas.totalRecuperado || 0, color: [16, 185, 129] },
            { titulo: 'Neta', valor: estadisticas.totalNeto || 0, color: [245, 158, 11] },
            { titulo: 'Tasa', valor: `${(estadisticas.porcentajeRecuperacion || 0).toFixed(1)}%`, color: [59, 130, 246] },
            { titulo: 'Eventos', valor: estadisticas.totalEventos || 0, color: [139, 92, 246] },
            { titulo: 'Promedio', valor: estadisticas.promedioPerdida || 0, color: [236, 72, 153] }
        ];

        for (let i = 0; i < kpis.length; i++) {
            const kpi = kpis[i];
            const xKPI = margen + (i * (anchoKPI + espacio));

            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yPos, anchoKPI, 30, 3, 3, 'FD');

            pdf.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.rect(xKPI, yPos, anchoKPI, 3, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(0, 0, 0);
            pdf.text(kpi.titulo, xKPI + 3, yPos + 10);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);

            let valorTexto;
            if (typeof kpi.valor === 'number' && kpi.titulo !== 'Tasa') {
                if (Math.abs(kpi.valor) >= 1000000) {
                    valorTexto = `$${(kpi.valor / 1000000).toFixed(1)}M`;
                } else if (Math.abs(kpi.valor) >= 1000) {
                    valorTexto = `$${(kpi.valor / 1000).toFixed(0)}K`;
                } else {
                    valorTexto = formatter.format(kpi.valor);
                }
            } else {
                valorTexto = kpi.valor;
            }

            pdf.text(valorTexto, xKPI + 3, yPos + 25);
        }

        return yPos + 34;
    }

    _dibujarAvisoPrivacidadIntegrado(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaAviso = 26;

        pdf.saveGraphicsState();

        pdf.setFillColor(248, 248, 248);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, altoPagina - alturaAviso - 12, anchoContenido, alturaAviso, 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(80, 80, 80);
        pdf.text("AVISO DE PRIVACIDAD", margen + 6, altoPagina - alturaAviso - 5);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro - 0.5);
        pdf.setTextColor(100, 100, 100);

        const aviso = "La informacion contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela. Este reporte tiene caracter informativo y no constituye un documento legal oficial. Los datos aqui presentados son confidenciales y de uso interno.";
        const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 20);
        let yAviso = altoPagina - alturaAviso + 2;

        for (let i = 0; i < Math.min(lineasAviso.length, 2); i++) {
            pdf.text(lineasAviso[i], margen + 6, yAviso + (i * 4.5));
        }

        pdf.restoreGraphicsState();
    }

    _limpiarTexto(texto) {
        if (!texto) return '';
        return texto
            .toString()
            .replace(/[^\w\sáéíóúñÑüÜÁÉÍÓÚ\-/\(\)\$\#\%\&\'\.\,]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    dibujarEncabezadoBase(pdf, titulo, subtitulo) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const alturaEncabezado = 35;

        pdf.saveGraphicsState();
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, anchoPagina, alturaEncabezado, 'F');

        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, 0, anchoPagina, 3, 'F');

        const dimensiones = this.dimensionesLogo;
        const yLogo = 18;
        const xLogoDerecha = anchoPagina - margen - (dimensiones.diametro * 2) - dimensiones.separacion;
        const xCentinela = xLogoDerecha;
        const xOrganizacion = xCentinela + dimensiones.diametro + dimensiones.separacion;

        this._dibujarLogos(pdf, xCentinela, xOrganizacion, yLogo, dimensiones.diametro / 2);

        pdf.setTextColor(coloresBase.primario);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.tituloPrincipal);
        pdf.text(titulo, anchoPagina / 2, 13, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.subtitulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text(subtitulo, anchoPagina / 2, 22, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Generado: ${this.formatearFecha(new Date())}`, margen, 31);

        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, alturaEncabezado - 3, anchoPagina - margen, alturaEncabezado - 3);

        pdf.restoreGraphicsState();
    }

    dibujarPiePagina(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();

        pdf.saveGraphicsState();

        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, altoPagina - 10, anchoPagina - margen, altoPagina - 10);

        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Sistema Centinela - Reporte Estadistico Unificado', margen, altoPagina - 4);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Pagina ${this.paginaActualReal} de ${this.totalPaginas}`, anchoPagina - margen, altoPagina - 4, { align: 'right' });

        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 2, anchoPagina, 2, 'F');

        pdf.restoreGraphicsState();
    }
}

export const generadorPDFEstadisticasUnificado = new PDFEstadisticasUnificadoGenerator();
export default generadorPDFEstadisticasUnificado;