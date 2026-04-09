// EstadisticasExtraviosPDF.js
// VERSIÓN: 2.2 - SIN EMOJIS + LEYENDA DE COLORES + FILTROS COMPACTOS

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

// =============================================
// CONFIGURACIÓN DE COLORES
// =============================================
export const coloresExtravios = {
    ...coloresBase,
    graficas: {
        perdidas: '#ef4444',
        recuperaciones: '#10b981',
        neto: '#f59e0b',
        porcentaje: '#3b82f6',
        eventos: '#8b5cf6',
        promedio: '#ec4899',
        robo: '#ef4444',
        extravio: '#f59e0b',
        accidente: '#3b82f6',
        otro: '#8b5cf6',
        topSucursales: '#3b82f6',
        topSucursalesBarra: '#2563eb'
    }
};

// CONFIGURACIÓN DEL GRID
const GRID_CONFIG = {
    ANCHO_CONTENEDOR: 90,
    ALTO_CONTENEDOR: 65,
    ALTO_CONTENEDOR_CIRCULAR: 90,
    MARGEN_PAGINA: 12,
    ESPACIADO_HORIZONTAL: 8,
    ESPACIADO_VERTICAL: 8,
    ALTURA_TITULO: 8,
    ALTURA_GRAFICA: 50,
    // Altura de la leyenda de colores
    ALTURA_LEYENDA: 12
};

class EstadisticasExtraviosPDFGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        this.datos = null;
        this.estadisticas = null;
        this.registros = [];
        this.sucursales = [];
        this.filtrosAplicados = {};
        this.fechaInicio = null;
        this.fechaFin = null;
        this.tipoEvento = null;

        this.graficasCapturadas = {
            tipoEvento: null,
            evolucionMensual: null,
            topSucursales: null,
            comparativa: null
        };

        this.fonts = {
            tituloPrincipal: 12,
            titulo: 10,
            subtitulo: 9,
            normal: 8,
            small: 7,
            mini: 6,
            micro: 5
        };
    }

    async capturarGraficas() {
        const canvasIds = [
            { id: 'graficoTipoEvento', key: 'tipoEvento' },
            { id: 'graficoEvolucionMensual', key: 'evolucionMensual' },
            { id: 'graficoTopSucursales', key: 'topSucursales' },
            { id: 'graficoComparativa', key: 'comparativa' }
        ];

        for (const item of canvasIds) {
            const canvas = document.getElementById(item.id);
            if (canvas && canvas instanceof HTMLCanvasElement) {
                try {
                    const scale = 2;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width * scale;
                    tempCanvas.height = canvas.height * scale;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                    this.graficasCapturadas[item.key] = tempCanvas.toDataURL('image/png', 1.0);
                } catch (error) {
                    console.error(`Error capturando gráfica ${item.id}:`, error);
                    this.graficasCapturadas[item.key] = null;
                }
            } else {
                this.graficasCapturadas[item.key] = null;
            }
        }
    }

    configurarDatos(datos) {
        this.datos = datos;
        this.estadisticas = datos.estadisticas;
        this.registros = datos.registros || [];
        this.sucursales = datos.sucursalesResumen || [];
        
        if (datos.filtros) {
            this.filtrosAplicados = datos.filtros;
            this.fechaInicio = datos.filtros.fechaInicio;
            this.fechaFin = datos.filtros.fechaFin;
            this.tipoEvento = datos.filtros.tipoEvento;
        }
    }

    async generarReporte(datos, opciones = {}) {
        try {
            const { mostrarAlerta = true, tituloPersonalizado = 'RECUPERACIONES' } = opciones;

            this.configurarDatos(datos);

            if (mostrarAlerta) {
                Swal.fire({
                    title: 'Generando Reporte PDF...',
                    html: `<div style="margin-bottom:10px;"><i class="fas fa-chart-line" style="font-size:32px; color:#c9a03d;"></i></div>
                        <div class="progress-bar-container" style="width:100%; height:20px; background:rgba(0,0,0,0.1); border-radius:10px; margin-top:10px;">
                            <div class="progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #1a3b5d, #c9a03d); border-radius:10px;"></div>
                        </div>
                        <p style="margin-top:12px;">Procesando datos y capturando gráficas...</p>`,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        let progreso = 0;
                        const intervalo = setInterval(() => {
                            progreso += 5;
                            if (progreso <= 80) {
                                const barra = document.querySelector('.progress-bar');
                                if (barra) barra.style.width = progreso + '%';
                            }
                        }, 150);
                        window._intervaloProgreso = intervalo;
                    }
                });
            }

            await this.capturarGraficas();
            await this.cargarLibrerias();
            await this.cargarLogoCentinela();
            await this.cargarLogoOrganizacion();

            if (mostrarAlerta && window._intervaloProgreso) {
                clearInterval(window._intervaloProgreso);
                const barra = document.querySelector('.progress-bar');
                if (barra) barra.style.width = '85%';
            }

            const pdf = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            this.totalPaginas = 2;
            this.paginaActualReal = 1;

            await this._generarContenido(pdf, tituloPersonalizado);

            const fechaStr = this.formatearFechaArchivo();
            const nombreArchivo = `PERDIDAS_RECUPERACIONES_${this.organizacionActual?.nombre || 'organizacion'}_${fechaStr}.pdf`;

            if (mostrarAlerta) {
                if (window._intervaloProgreso) clearInterval(window._intervaloProgreso);
                Swal.close();
                await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            }

            return pdf;

        } catch (error) {
            console.error('Error generando reporte:', error);
            if (window._intervaloProgreso) clearInterval(window._intervaloProgreso);
            if (mostrarAlerta) {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el reporte: ' + error.message });
            }
            throw error;
        }
    }

    async _generarContenido(pdf, tituloPersonalizado) {
        // PÁGINA 1
        this.dibujarEncabezadoBase(pdf, tituloPersonalizado, this.organizacionActual?.nombre || 'SISTEMA CENTINELA');

        let yPos = this.alturaEncabezado + 3; // Reducido de +5
        yPos = this._dibujarInformacionFiltrosCompacto(pdf, yPos);
        yPos += 3; // Reducido de +5
        yPos = this._dibujarKPIsSinEmojis(pdf, yPos);
        yPos += 6; // Reducido de +8

        await this._dibujarGridGraficas(pdf, yPos);

        this.dibujarPiePagina(pdf);

        // PÁGINA 2: TABLA
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, tituloPersonalizado, 'RESUMEN POR SUCURSAL');

        let yPosTabla = this.alturaEncabezado + 8;
        
        if (this.sucursales && this.sucursales.length > 0) {
            this._dibujarTablaResumenConBordes(pdf, yPosTabla);
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(150, 150, 150);
            pdf.text('No hay datos de sucursales para mostrar', GRID_CONFIG.MARGEN_PAGINA, yPosTabla + 20);
        }

        this._dibujarAvisoPrivacidad(pdf);
        this.dibujarPiePagina(pdf);
    }

    // =============================================
    // FILTROS APLICADOS - VERSIÓN MÁS COMPACTA
    // =============================================
    _dibujarInformacionFiltrosCompacto(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);

        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoContenido, 10, 2, 2, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(26, 59, 93);
        pdf.text('FILTROS:', margen + 5, yPos + 4);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(80, 80, 80);

        let filtroText = '';
        if (this.fechaInicio && this.fechaFin) {
            filtroText += `${this.formatearFechaVisualizacion(new Date(this.fechaInicio))} - ${this.formatearFechaVisualizacion(new Date(this.fechaFin))}`;
        } else {
            filtroText += 'Todo el historial';
        }

        filtroText += ' | ';
        
        if (this.filtrosAplicados.sucursal && this.filtrosAplicados.sucursal !== 'todas') {
            filtroText += `${this.filtrosAplicados.sucursal}`;
        } else {
            filtroText += 'Todas las sucursales';
        }

        filtroText += ' | ';

        if (this.tipoEvento && this.tipoEvento !== 'todos') {
            filtroText += `${this._capitalize(this.tipoEvento)}`;
        } else {
            filtroText += 'Todos los tipos';
        }

        pdf.text(filtroText, margen + 45, yPos + 4);

        return yPos + 10;
    }

    // =============================================
    // KPIs SIN EMOJIS
    // =============================================
    _dibujarKPIsSinEmojis(pdf, yPos) {
        if (!this.estadisticas) return yPos;

        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoKPI = (anchoPagina - (margen * 2) - 15) / 3;
        const espacioKPI = 7.5;
        const alturaKPI = 22;

        const formatter = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });

        const kpis = [
            { titulo: 'Total Perdido', valor: this.estadisticas.totalPerdido, color: [239, 68, 68] },
            { titulo: 'Total Recuperado', valor: this.estadisticas.totalRecuperado, color: [16, 185, 129] },
            { titulo: 'Pérdida Neta', valor: this.estadisticas.totalNeto, color: [245, 158, 11] },
            { titulo: 'Tasa Recuperación', valor: this.estadisticas.porcentajeRecuperacion, esPorcentaje: true, color: [59, 130, 246] },
            { titulo: 'Total Eventos', valor: this.estadisticas.totalEventos, color: [139, 92, 246] },
            { titulo: 'Promedio x Evento', valor: this.estadisticas.promedioPerdida, color: [236, 72, 153] }
        ];

        for (let i = 0; i < kpis.length; i++) {
            const kpi = kpis[i];
            const columna = i % 3;
            const fila = Math.floor(i / 3);
            const xKPI = margen + (columna * (anchoKPI + espacioKPI));
            const yKPI = yPos + (fila * (alturaKPI + 4));

            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yKPI, anchoKPI, alturaKPI, 2, 2, 'FD');

            pdf.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.rect(xKPI, yKPI, anchoKPI, 2, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(80, 80, 80);
            pdf.text(kpi.titulo, xKPI + 4, yKPI + 8);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);

            let valorTexto;
            if (kpi.esPorcentaje) {
                valorTexto = `${kpi.valor.toFixed(2)}%`;
            } else if (typeof kpi.valor === 'number') {
                if (kpi.titulo === 'Total Eventos') {
                    valorTexto = kpi.valor.toLocaleString('es-MX');
                } else {
                    valorTexto = formatter.format(kpi.valor);
                }
            } else {
                valorTexto = kpi.valor;
            }

            pdf.text(valorTexto, xKPI + 4, yKPI + 18);
        }

        return yPos + (alturaKPI * 2) + 10;
    }

    // =============================================
    // GRID DE GRÁFICAS 2x2
    // =============================================
    async _dibujarGridGraficas(pdf, yPosInicial) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenedor = GRID_CONFIG.ANCHO_CONTENEDOR;
        const altoContenedorNormal = GRID_CONFIG.ALTO_CONTENEDOR;
        const altoContenedorCircular = GRID_CONFIG.ALTO_CONTENEDOR_CIRCULAR;
        const espaciadoH = GRID_CONFIG.ESPACIADO_HORIZONTAL;
        const espaciadoV = GRID_CONFIG.ESPACIADO_VERTICAL;

        const anchoTotal = (anchoContenedor * 2) + espaciadoH;
        const inicioX = margen + ((pdf.internal.pageSize.getWidth() - (margen * 2) - anchoTotal) / 2);
        
        const col1X = inicioX;
        const col2X = inicioX + anchoContenedor + espaciadoH;
        
        const fila1Y = yPosInicial;
        const fila2Y = fila1Y + altoContenedorCircular + espaciadoV;

        // GRÁFICA 1: DISTRIBUCIÓN POR TIPO (con leyenda de colores)
        await this._dibujarContenedorGraficaCircularConLeyenda(
            pdf,
            'DISTRIBUCIÓN POR TIPO',
            this.graficasCapturadas.tipoEvento,
            col1X,
            fila1Y,
            anchoContenedor,
            altoContenedorCircular
        );

        // GRÁFICA 2: EVOLUCIÓN MENSUAL
        await this._dibujarContenedorGraficaNormal(
            pdf,
            'EVOLUCIÓN MENSUAL',
            this.graficasCapturadas.evolucionMensual,
            col2X,
            fila1Y,
            anchoContenedor,
            altoContenedorNormal
        );

        // GRÁFICA 3: TOP SUCURSALES
        await this._dibujarContenedorGraficaNormal(
            pdf,
            'TOP SUCURSALES',
            this.graficasCapturadas.topSucursales,
            col1X,
            fila2Y,
            anchoContenedor,
            altoContenedorNormal
        );

        // GRÁFICA 4: PÉRDIDA VS RECUPERACIÓN
        await this._dibujarContenedorGraficaNormal(
            pdf,
            'PÉRDIDA VS RECUPERACIÓN',
            this.graficasCapturadas.comparativa,
            col2X,
            fila2Y,
            anchoContenedor,
            altoContenedorNormal
        );
    }

    // =============================================
    // CONTENEDOR PARA GRÁFICAS NORMALES
    // =============================================
    async _dibujarContenedorGraficaNormal(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 3;
        const alturaTitulo = GRID_CONFIG.ALTURA_TITULO;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 1, x + ancho - 4, y + alturaTitulo - 1);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini + 0.5);
        pdf.setTextColor(26, 59, 93);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });

        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 2;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 6;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(150, 150, 150);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(150, 150, 150);
            pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    // =============================================
    // CONTENEDOR PARA GRÁFICA CIRCULAR CON LEYENDA DE COLORES
    // =============================================
    async _dibujarContenedorGraficaCircularConLeyenda(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 5;
        const alturaTitulo = GRID_CONFIG.ALTURA_TITULO;
        const alturaLeyenda = GRID_CONFIG.ALTURA_LEYENDA;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 1, x + ancho - 4, y + alturaTitulo - 1);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini + 0.5);
        pdf.setTextColor(26, 59, 93);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });

        // Área CUADRADA para la gráfica circular
        const graficaLado = Math.min(ancho - (padding * 2), alto - alturaTitulo - alturaLeyenda - 10);
        const graficaX = x + (ancho - graficaLado) / 2;
        const graficaY = y + alturaTitulo + 5;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaLado, graficaLado, 'F');

        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaLado - 2, graficaLado - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(150, 150, 150);
                pdf.text('Error', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(150, 150, 150);
            pdf.text('Sin datos', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
        }

        // LEYENDA DE COLORES
        const leyendaY = graficaY + graficaLado + 3;
        const coloresLeyenda = [
            { color: '#ef4444', nombre: 'Robo' },
            { color: '#f59e0b', nombre: 'Extravío' },
            { color: '#3b82f6', nombre: 'Accidente' },
            { color: '#8b5cf6', nombre: 'Otro' }
        ];
        
        const anchoCuadro = 5;
        const espacioEntreItems = 18;
        const inicioXleyenda = x + (ancho / 2) - ((coloresLeyenda.length * espacioEntreItems) / 2);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        
        for (let i = 0; i < coloresLeyenda.length; i++) {
            const item = coloresLeyenda[i];
            const itemX = inicioXleyenda + (i * espacioEntreItems);
            
            pdf.setFillColor(item.color);
            pdf.rect(itemX, leyendaY, anchoCuadro, anchoCuadro, 'F');
            
            pdf.setTextColor(80, 80, 80);
            pdf.text(item.nombre, itemX + anchoCuadro + 2, leyendaY + 4);
        }
    }

    // =============================================
    // TABLA DE RESUMEN CON BORDES
    // =============================================
    _dibujarTablaResumenConBordes(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoContenido = anchoPagina - (margen * 2);

        if (!this.sucursales || this.sucursales.length === 0) return;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(26, 59, 93);
        pdf.text('RESUMEN POR SUCURSAL', margen, yPos);
        yPos += 5;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen, yPos, margen + 70, yPos);
        yPos += 8;

        const colAnchos = {
            sucursal: 50,
            eventos: 18,
            perdido: 32,
            recuperado: 32,
            neto: 32,
            porcentaje: 24
        };

        const xInicio = margen;
        let xActual = xInicio;
        const altoFila = 6;

        const dibujarLineaHorizontal = (y, desdeX, hastaX) => {
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.2);
            pdf.line(desdeX, y, hastaX, y);
        };
        
        const dibujarLineaVertical = (x, desdeY, hastaY) => {
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.2);
            pdf.line(x, desdeY, x, hastaY);
        };

        const colPositions = [xInicio];
        let acumulado = xInicio;
        for (const key of Object.keys(colAnchos)) {
            acumulado += colAnchos[key];
            colPositions.push(acumulado);
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(26, 59, 93);
        pdf.setFillColor(230, 230, 230);
        pdf.rect(xInicio, yPos - 2, anchoContenido, altoFila + 1, 'F');

        const headers = [
            { text: 'Sucursal', width: colAnchos.sucursal, align: 'left' },
            { text: 'Eventos', width: colAnchos.eventos, align: 'center' },
            { text: 'Perdido', width: colAnchos.perdido, align: 'right' },
            { text: 'Recuperado', width: colAnchos.recuperado, align: 'right' },
            { text: 'Pérdida Neta', width: colAnchos.neto, align: 'right' },
            { text: '% Rec.', width: colAnchos.porcentaje, align: 'center' }
        ];

        let currentX = xInicio;
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const xCentro = currentX + (header.width / 2);
            pdf.text(header.text, header.align === 'center' ? xCentro : currentX + 2, yPos, { align: header.align });
            currentX += header.width;
        }

        for (const pos of colPositions) {
            dibujarLineaVertical(pos, yPos - 2, yPos + altoFila - 1);
        }
        dibujarLineaHorizontal(yPos + altoFila - 1, xInicio, xInicio + anchoContenido);

        yPos += altoFila + 2;

        const formatter = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);

        const maxFilas = Math.min(this.sucursales.length, 14);
        
        for (let i = 0; i < maxFilas; i++) {
            const suc = this.sucursales[i];
            
            if (yPos > 260) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(150, 150, 150);
                pdf.text(`... y ${this.sucursales.length - i} sucursales mas`, margen, yPos + 5);
                break;
            }

            if (i % 2 === 0) {
                pdf.setFillColor(252, 252, 252);
                pdf.rect(xInicio, yPos - 2, anchoContenido, altoFila + 1, 'F');
            }

            currentX = xInicio;
            
            const nombreSuc = suc.nombre && suc.nombre.length > 28 ? suc.nombre.substring(0, 25) + '...' : (suc.nombre || 'N/A');
            pdf.text(nombreSuc, currentX + 2, yPos);
            currentX += colAnchos.sucursal;
            
            pdf.text(suc.eventos?.toString() || '0', currentX + (colAnchos.eventos / 2), yPos, { align: 'center' });
            currentX += colAnchos.eventos;
            
            const perdido = suc.perdido || 0;
            pdf.setTextColor(239, 68, 68);
            pdf.text(formatter.format(perdido), currentX + colAnchos.perdido - 2, yPos, { align: 'right' });
            currentX += colAnchos.perdido;
            
            const recuperado = suc.recuperado || 0;
            pdf.setTextColor(16, 185, 129);
            pdf.text(formatter.format(recuperado), currentX + colAnchos.recuperado - 2, yPos, { align: 'right' });
            currentX += colAnchos.recuperado;
            
            const neto = perdido - recuperado;
            pdf.setTextColor(neto > 0 ? 239 : 16, neto > 0 ? 68 : 185, neto > 0 ? 68 : 129);
            pdf.text(formatter.format(neto), currentX + colAnchos.neto - 2, yPos, { align: 'right' });
            currentX += colAnchos.neto;
            
            const porcentaje = suc.porcentaje || 0;
            pdf.setTextColor(59, 130, 246);
            pdf.text(`${porcentaje.toFixed(2)}%`, currentX + (colAnchos.porcentaje / 2), yPos, { align: 'center' });
            
            dibujarLineaHorizontal(yPos + altoFila - 1, xInicio, xInicio + anchoContenido);
            for (const pos of colPositions) {
                dibujarLineaVertical(pos, yPos - 2, yPos + altoFila - 1);
            }
            
            yPos += altoFila + 1;
            pdf.setTextColor(80, 80, 80);
        }

        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.5);
        pdf.rect(xInicio, yPos - (maxFilas * (altoFila + 1)) - 4, anchoContenido, (maxFilas * (altoFila + 1)) + 6, 'S');
    }

    _dibujarAvisoPrivacidad(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaAviso = 24;

        pdf.setFillColor(248, 248, 248);
        pdf.rect(margen, altoPagina - alturaAviso - 8, anchoContenido, alturaAviso, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(80, 80, 80);
        pdf.text("AVISO DE PRIVACIDAD", margen + 5, altoPagina - alturaAviso - 3);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        pdf.setTextColor(100, 100, 100);
        
        const aviso = "La informacion contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela. Este reporte tiene caracter informativo.";
        const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 15);
        
        let yAviso = altoPagina - alturaAviso + 2;
        for (let i = 0; i < Math.min(lineasAviso.length, 2); i++) {
            pdf.text(lineasAviso[i], margen + 5, yAviso + (i * 4));
        }
    }

    _capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    dibujarEncabezadoBase(pdf, titulo, subtitulo) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const alturaEncabezado = 38;

        pdf.saveGraphicsState();

        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, anchoPagina, alturaEncabezado, 'F');

        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, 0, anchoPagina, 2, 'F');

        const dimensiones = this.dimensionesLogo;
        const yLogo = 18;
        const xLogoDerecha = anchoPagina - margen - (dimensiones.diametro * 2) - dimensiones.separacion;
        const xCentinela = xLogoDerecha;
        const xOrganizacion = xCentinela + dimensiones.diametro + dimensiones.separacion;

        this._dibujarLogos(pdf, xCentinela, xOrganizacion, yLogo, dimensiones.diametro / 2);

        pdf.setTextColor(coloresBase.primario);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.tituloPrincipal);
        pdf.text(titulo, anchoPagina / 2, 14, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(coloresBase.textoClaro);
        pdf.text(subtitulo, anchoPagina / 2, 21, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(coloresBase.textoClaro);
        pdf.text(`Generado: ${this.formatearFecha(new Date())}`, margen, 30);

        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.5);
        pdf.line(margen, alturaEncabezado - 2, anchoPagina - margen, alturaEncabezado - 2);

        pdf.restoreGraphicsState();
    }

    dibujarPiePagina(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaPie = 8;

        pdf.saveGraphicsState();
        
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, altoPagina - alturaPie - 2, anchoPagina - margen, altoPagina - alturaPie - 2);
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(coloresBase.textoClaro);
        pdf.text('Sistema Centinela -  Recuperaciones', margen, altoPagina - 4);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(coloresBase.textoClaro);
        pdf.text(`Pagina ${this.paginaActualReal} de ${this.totalPaginas}`, anchoPagina - margen, altoPagina - 4, { align: 'right' });
        
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 1.5, anchoPagina, 1.5, 'F');
        
        pdf.restoreGraphicsState();
    }
}

export const generadorPDFEstadisticasExtravios = new EstadisticasExtraviosPDFGenerator();
export default generadorPDFEstadisticasExtravios;