/**
 * Trusted document-only code, embedded identically in browser preview and PDF.
 * It reads already-escaped DOM content, never evaluates design strings.
 */
export function paginateDocument() {
  const root = document.getElementById("invoice-pages")!;
  const source = document.getElementById("invoice-source")!;
  const cfg = JSON.parse(document.getElementById("invoice-layout")!.textContent!) as {
    elements: Array<{id:string;kind:string;x:number;y:number;width:number;height:number}>;
    language:string;
  };
  const scale = 96/25.4, mm = (px:number) => px/scale;
  const find = (kind:string) => cfg.elements.find(e=>e.kind===kind)!;
  const table = find("table")??{id:"table",kind:"table",x:14,y:105,width:182,height:65};
  // Reserve the footer's measured design band above the 8mm safe margin.
  // Saved designs (e.g. footer y=280,h=8) are lifted at render time only; stored designs are untouched.
  // 18.2mm mark + gap + 10pt site line + rule: 25mm band. A deleted footer frees the band entirely.
  const FOOTER_BAND=25, savedFooter=cfg.elements.find(e=>e.kind==="footer");
  const footerNode=source.querySelector<HTMLElement>('[data-kind="footer"]');
  const footer=savedFooter&&footerNode?{...savedFooter,y:Math.min(savedFooter.y,289-FOOTER_BAND),height:FOOTER_BAND}:{y:289,height:0};
  let page: HTMLElement;
  const failures: string[] = [];
  function newPage() {
    page = document.createElement("section"); page.className="invoice-page";
    page.setAttribute("aria-label", cfg.language==="ar"?"صفحة الفاتورة":"Invoice page");
    root.appendChild(page);
    if(footerNode&&footer.height){
      const foot = footerNode.cloneNode(true) as HTMLElement;
      foot.style.top=`${footer.y}mm`;foot.style.height=`${footer.height}mm`;foot.style.minHeight=`${footer.height}mm`;
      page.appendChild(foot);
    }
    const index = document.createElement("span"); index.className="page-number";
    index.textContent=String(root.querySelectorAll(".invoice-page").length); page.appendChild(index);
    return page;
  }
  function append(el:HTMLElement,x:number,y:number,width:number) {
    el.style.left=`${x}mm`;el.style.top=`${y}mm`;el.style.width=`${width}mm`;
    page.appendChild(el);
    return y+mm(el.getBoundingClientRect().height);
  }
  newPage();
  let headerBottom=table.y-4;
  for(const e of cfg.elements.filter(e=>!["table","totals","notes","qr","footer"].includes(e.kind))) {
    const node=source.querySelector<HTMLElement>(`[data-element="${e.id}"]`);
    if(!node) continue;
    const bottom=append(node,e.x,e.y,e.width);
    headerBottom=Math.max(headerBottom,bottom);
    if(bottom>footer.y-4) failures.push(`${e.id}: المحتوى أطول من المساحة المتاحة`);
  }
  const warning=source.querySelector<HTMLElement>('[data-warning]');
  if(warning) headerBottom=append(warning,table.x,headerBottom+3,table.width)+3;
  // Notes are never rendered; totals take the saved notes box's LEFT position (render-time only, designs untouched).
  const notesBox=cfg.elements.find(e=>e.kind==="notes"), savedTotals=find("totals");
  const effective=(kind:string)=>kind==="totals"&&notesBox&&savedTotals?{...savedTotals,x:notesBox.x,y:notesBox.y,width:notesBox.width,height:notesBox.height}:find(kind);
  // Boxes with no rendered content (e.g. historical/cancelled QR, deleted elements) take no space at all.
  const summary = ["totals","qr"].map(kind=>({e:effective(kind),node:source.querySelector<HTMLElement>(`[data-kind="${kind}"]`)}))
    .filter((s):s is {e:typeof table;node:HTMLElement}=>!!s.e&&!!s.node&&s.node.innerHTML.trim()!=="");
  // Measure natural content sizes before assigning the summary to a page.
  const measure=document.createElement("div"); measure.className="invoice-measure";root.appendChild(measure);
  const summaryOrigin=summary.length?Math.min(...summary.map(s=>s.e.y)):maxBottomFor();
  function maxBottomFor(){return footer.y-5;}
  let summaryHeight=0;
  const offsets = new Map<string,number>();
  const heights = new Map<string,number>();
  for(const {e,node} of summary) {
    node.style.position="relative";node.style.left="0";node.style.top="0";node.style.width=`${e.width}mm`;
    measure.appendChild(node);
    // Totals use their actual rendered height (saved box height is only a minimum in the editor), QR keeps its square.
    if(e.kind!=="qr") node.style.minHeight="0";
    heights.set(e.kind,e.kind==="qr"?Math.max(e.height,mm(node.getBoundingClientRect().height)):mm(node.getBoundingClientRect().height));
    offsets.set(e.kind,e.y-summaryOrigin);
    node.style.position="absolute";
  }
  // Compact stacking: a box sitting below another (horizontally overlapping) box follows the dynamic
  // bottom of that box with its designed gap capped at 4mm. Horizontal positions are untouched;
  // excess saved blank space between totals and QR no longer pushes the summary onto a new page.
  const GAP_CAP=4, ordered=[...summary].sort((a,b)=>a.e.y-b.e.y);
  for(let n=0;n<ordered.length;n++){
    const s=ordered[n];let off=0;
    for(let m=0;m<n;m++){const p=ordered[m];
      if(s.e.x<p.e.x+p.e.width&&s.e.x+s.e.width>p.e.x) off=Math.max(off,offsets.get(p.e.kind)!+heights.get(p.e.kind)!+Math.min(GAP_CAP,Math.max(0,s.e.y-p.e.y-p.e.height)));
    }
    offsets.set(s.e.kind,off);
  }
  for(const {e} of summary) summaryHeight=Math.max(summaryHeight,offsets.get(e.kind)!+heights.get(e.kind)!);
  const allRows=Array.from(source.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
  const emptyTable=source.querySelector<HTMLTableElement>("table")!;
  emptyTable.querySelector("tbody")!.replaceChildren();
  let currentTable!: HTMLTableElement, tbody!: HTMLTableSectionElement, startY=0;
  function tablePage(y:number) {
    startY=y;currentTable=emptyTable.cloneNode(true) as HTMLTableElement;
    const wrap=document.createElement("div");wrap.className="invoice-block invoice-table";wrap.dataset.kind="table";wrap.dataset.element=table.id;
    wrap.appendChild(currentTable);append(wrap,table.x,y,table.width);
    tbody=currentTable.querySelector("tbody")!;
  }
  const rowBottom=()=>startY+mm(currentTable.getBoundingClientRect().height);
  tablePage(Math.max(table.y,headerBottom+4));
  const maxBottom=footer.y-4;
  // Pagination uses actual browser font metrics, not an estimated row count.
  for(const row of allRows) {
    tbody.appendChild(row);
    if(rowBottom()>maxBottom) {
      row.remove();
      if(tbody.children.length || startY>15) {newPage();tablePage(14);}
      tbody.appendChild(row);
      if(rowBottom()>maxBottom) {
        // Extremely long product descriptions are split into continuation rows.
        let cell=row.querySelector<HTMLElement>("[data-product]")!;
        const words=(cell.textContent??"").split(/\s+/);
        cell.textContent="";
        let activeRow = row;
        while(words.length) {
          let accepted="";
          while(words.length) {
            const next=words[0];cell.textContent=(accepted+" "+next).trim();
            if(rowBottom()>maxBottom && accepted) {cell.textContent=accepted;break;}
            accepted=cell.textContent;words.shift();
            if(rowBottom()>maxBottom) {failures.push("كلمة في وصف المنتج تتجاوز الصفحة");break;}
          }
          if(words.length) {
            newPage();tablePage(14);
            const continuation=activeRow.cloneNode(true) as HTMLTableRowElement;
            for(const td of Array.from(continuation.cells)) if(!td.hasAttribute("data-product")) td.textContent="—";
            cell=continuation.querySelector<HTMLElement>("[data-product]")!;
            cell.textContent="";
            tbody.appendChild(continuation);
            activeRow=continuation;
          }
        }
      }
    }
  }
  // Summary follows the actual table bottom; saved vertical blank offsets are not reproduced.
  let summaryY=rowBottom()+5;
  // Shipping flows after the occupied summary (full table width) when it fits on the same page.
  // Compact overflow fallback when the same-column stack leaves no room: the QR moves into the empty
  // side beside the totals (same size, 6mm gap) and the shipping attachment flows in that side column
  // below the QR. Nothing is shrunk; if neither fits, the attachment starts a fresh page.
  const shippingSrc=source.querySelector<HTMLElement>("[data-shipping]");
  const qrS=summary.find(s=>s.e.kind==="qr"),totS=summary.find(s=>s.e.kind==="totals");
  const probeShipping=(width:number)=>{
    if(!shippingSrc) return 0;
    const probe=shippingSrc.cloneNode(true) as HTMLElement;probe.style.width=`${width}mm`;
    let h=0;measure.appendChild(probe);
    for(const c of Array.from(probe.children) as HTMLElement[]){c.style.margin="0";h+=mm(c.getBoundingClientRect().height)+4;}
    probe.remove();return h;
  };
  let shipX=table.x,shipW=table.width,shipStart=summary.length?summaryY+summaryHeight+5:rowBottom()+5;
  if(qrS&&totS&&offsets.get("qr")!>0&&(summaryY+summaryHeight>maxBottom||(shippingSrc&&shipStart+probeShipping(table.width)>maxBottom))){
    const w=qrS.e.width,rightX=totS.e.x+totS.e.width+6,leftX=totS.e.x-6-w;
    const useRight=rightX+w<=table.x+table.width, useLeft=!useRight&&leftX>=table.x;
    if(useRight||useLeft){
      const colX=useRight?rightX:table.x, colW=useRight?table.x+table.width-rightX:totS.e.x-6-table.x;
      const qrX=useRight?table.x+table.width-w:leftX;
      const qrHeight=heights.get("qr")!;
      const sideHeight=Math.max(offsets.get("totals")!+heights.get("totals")!,qrHeight+(shippingSrc?5+probeShipping(colW):0));
      if(colW>=(shippingSrc?60:w)&&summaryY+sideHeight<=maxBottom){
        qrS.e={...qrS.e,x:qrX};offsets.set("qr",0);
        summaryHeight=Math.max(...summary.map(s=>offsets.get(s.e.kind)!+heights.get(s.e.kind)!));
        shipX=colX;shipW=colW;shipStart=summaryY+qrHeight+5;
      }
    }
  }
  // Try the compact arrangement before opening another sheet.
  if(summary.length&&summaryY+summaryHeight>maxBottom) {
    newPage();summaryY=14;shipX=table.x;shipW=table.width;shipStart=summaryY+summaryHeight+5;
  }
  for(const {e,node} of summary) {
    append(node,e.x,summaryY+offsets.get(e.kind)!,e.width);
  }
  function appendAttachment(container:HTMLElement,start:number) {
    const blocks=Array.from(container.children) as HTMLElement[];
    // Flows after the occupied summary; a block that does not fit moves to a fresh page below.
    let y=start;
    for(const block of blocks) {
      block.classList.add("invoice-block");block.style.margin="0";
      block.style.fontFamily=container.style.fontFamily||"InvoiceFormal";
      block.style.fontSize=container.style.fontSize||"11pt";
      block.style.lineHeight=container.style.lineHeight||"1.4";
      block.dir=container.dir|| (cfg.language==="ar"?"rtl":"ltr");
      let end=append(block,shipX,y,shipW);
      if(end>maxBottom && y>14) {block.remove();newPage();y=14;shipX=table.x;shipW=table.width;end=append(block,shipX,y,shipW);}
      if(end>maxBottom) {
        // Split long paragraphs at word boundaries without dropping text.
        const words=(block.textContent??"").split(/\s+/);
        block.textContent="";
        let activeBlock=block;
        while(words.length) {
          let accepted="";
          while(words.length) {
            activeBlock.textContent=(accepted+" "+words[0]).trim();
            end=y+mm(activeBlock.getBoundingClientRect().height);
            if(end>maxBottom && accepted) {activeBlock.textContent=accepted;break;}
            accepted=activeBlock.textContent;words.shift();
            if(end>maxBottom) {failures.push("كلمة في الملاحظات تتجاوز الصفحة");break;}
          }
          if(words.length) {
            newPage();y=14;activeBlock=block.cloneNode(false) as HTMLElement;
            shipX=table.x;shipW=table.width;append(activeBlock,shipX,y,shipW);
          }
        }
        end=y+mm(activeBlock.getBoundingClientRect().height);
      }
      y=end+4;
    }
  }
  const shipping=source.querySelector<HTMLElement>("[data-shipping]");
  if(shipping) appendAttachment(shipping,shipStart);
  for(const n of Array.from(source.querySelectorAll<HTMLElement>('[data-kind="qr"],[data-kind="totals"]'))) n.remove();
  measure.remove();source.remove();
  for(const p of Array.from(root.querySelectorAll<HTMLElement>(".invoice-page"))) {
    for(const el of Array.from(p.querySelectorAll<HTMLElement>(".invoice-block"))) {
      const b=el.getBoundingClientRect(),pb=p.getBoundingClientRect();
      if(b.bottom>pb.bottom-8*scale+.5 || b.right>pb.right-7*scale+.5 || b.left<pb.left+7*scale-.5)
        failures.push("محتوى خارج حدود الورقة");
    }
    const boxes=Array.from(p.querySelectorAll<HTMLElement>(":scope > .invoice-block")).filter(n=>n.dataset.kind!=="divider");
    for(let a=0;a<boxes.length;a++) for(let b=a+1;b<boxes.length;b++) {
      const x=boxes[a].getBoundingClientRect(),y=boxes[b].getBoundingClientRect();
      if(x.left<y.right-.5 && x.right>y.left+.5 && x.top<y.bottom-.5 && x.bottom>y.top+.5) failures.push("تداخل محتوى المستند");
    }
  }
  root.dataset.errors=JSON.stringify([...new Set(failures)]);
  root.dataset.ready="true";
  document.title=document.body.dataset.invoiceNumber??"Invoice";
}