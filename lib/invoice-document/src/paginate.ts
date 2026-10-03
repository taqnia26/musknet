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
  const footer = find("footer"), table = find("table");
  let page: HTMLElement;
  const failures: string[] = [];
  function newPage() {
    page = document.createElement("section"); page.className="invoice-page";
    page.setAttribute("aria-label", cfg.language==="ar"?"صفحة الفاتورة":"Invoice page");
    root.appendChild(page);
    const foot = source.querySelector<HTMLElement>('[data-kind="footer"]')!.cloneNode(true) as HTMLElement;
    page.appendChild(foot);
    const index = document.createElement("span"); index.className="page-number";
    index.textContent=String(root.children.length); page.appendChild(index);
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
    const node=source.querySelector<HTMLElement>(`[data-element="${e.id}"]`)!;
    const bottom=append(node,e.x,e.y,e.width);
    headerBottom=Math.max(headerBottom,bottom);
    if(bottom>footer.y-4) failures.push(`${e.id}: المحتوى أطول من المساحة المتاحة`);
  }
  const warning=source.querySelector<HTMLElement>('[data-warning]');
  if(warning) headerBottom=append(warning,table.x,headerBottom+3,table.width)+3;
  const summaryKinds=["notes","totals","qr"];
  const summary = summaryKinds.map(kind=>({e:find(kind),node:source.querySelector<HTMLElement>(`[data-kind="${kind}"]`)!}));
  // Measure natural content sizes before assigning the summary to a page.
  const measure=document.createElement("div"); measure.className="invoice-measure";root.appendChild(measure);
  const summaryOrigin=Math.min(...summary.map(s=>s.e.y));
  let summaryHeight=0;
  const offsets = new Map<string,number>();
  const heights = new Map<string,number>();
  for(const {e,node} of summary) {
    node.style.position="relative";node.style.left="0";node.style.top="0";node.style.width=`${e.width}mm`;
    measure.appendChild(node);
    heights.set(e.kind,Math.max(e.height,mm(node.getBoundingClientRect().height)));
    offsets.set(e.kind,e.y-summaryOrigin);
    node.style.position="absolute";
  }
  // Preserve designed gaps when a dynamic notes/totals block grows vertically.
  const qrSummary=summary.find(s=>s.e.kind==="qr")!;
  for(const s of summary.filter(s=>s.e.kind!=="qr")) {
    if(qrSummary.e.x<s.e.x+s.e.width&&qrSummary.e.x+qrSummary.e.width>s.e.x&&qrSummary.e.y>=s.e.y+s.e.height) {
      offsets.set("qr",Math.max(offsets.get("qr")!,offsets.get(s.e.kind)!+heights.get(s.e.kind)!+(qrSummary.e.y-s.e.y-s.e.height)));
    }
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
  const maxBottom=footer.y-5;
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
  let summaryY=Math.max(summaryOrigin,rowBottom()+8);
  if(summaryY+summaryHeight>maxBottom) {newPage();summaryY=14;}
  for(const {e,node} of summary) {
    append(node,e.x,summaryY+offsets.get(e.kind)!,e.width);
  }
  if(summaryY+summaryHeight>maxBottom) {
    // Move lengthy notes to their own paginated attachment; totals/QR stay intact.
    const notes=summary.find(s=>s.e.kind==="notes")!;
    notes.node.remove();
    // QR no longer needs the notes' expanded offset once notes move to an attachment.
    const qr=summary.find(s=>s.e.kind==="qr")!;
    qr.node.style.top=`${14+qr.e.y-summaryOrigin}mm`;
    appendAttachment(notes.node);
  }
  function appendAttachment(container:HTMLElement) {
    const blocks=Array.from(container.children) as HTMLElement[];
    let y=14;newPage();
    for(const block of blocks) {
      block.classList.add("invoice-block");
      block.style.fontFamily=container.style.fontFamily||"Amiri";
      block.style.fontSize=container.style.fontSize||"11pt";
      block.style.lineHeight=container.style.lineHeight||"1.4";
      block.dir=container.dir|| (cfg.language==="ar"?"rtl":"ltr");
      let end=append(block,table.x,y,table.width);
      if(end>maxBottom && y>14) {block.remove();newPage();y=14;end=append(block,table.x,y,table.width);}
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
            append(activeBlock,table.x,y,table.width);
          }
        }
        end=y+mm(activeBlock.getBoundingClientRect().height);
      }
      y=end+3;
    }
  }
  const shipping=source.querySelector<HTMLElement>("[data-shipping]");
  if(shipping) appendAttachment(shipping);
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