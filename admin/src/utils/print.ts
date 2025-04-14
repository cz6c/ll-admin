interface PrintConfig {
  styleStr: string;
  setDomHeightArr: any[];
  printBeforeFn: ((...args: any[]) => void) | null;
  printDoneCallBack: (() => void) | null;
}

export default class Print {
  private dom: HTMLElement;
  private conf: PrintConfig;

  constructor(dom: HTMLElement | string, options?: Partial<PrintConfig>) {
    options = options || {};

    this.conf = {
      styleStr: "",
      setDomHeightArr: [],
      printBeforeFn: null,
      printDoneCallBack: null,
      ...options
    };

    if (typeof dom === "string") {
      const el = document.querySelector(dom);
      if (!el) throw new Error("Element not found");
      this.dom = el as HTMLElement;
    } else {
      this.dom = this.isDOM(dom) ? (dom as HTMLElement) : (dom as any).$el;
    }

    if (this.conf.setDomHeightArr?.length) {
      this.setDomHeight(this.conf.setDomHeightArr);
    }

    const content = this.getStyle() + this.getHtml();
    this.writeIframe(content);
  }

  private getStyle(): string {
    let str = "";
    const styles = document.querySelectorAll("style,link");
    styles.forEach(style => (str += style.outerHTML));
    str += `<style>.no-print{display:none;}${this.conf.styleStr}</style>`;
    return str;
  }

  private getHtml(): string {
    // 处理表单元素状态（保持原有逻辑）
    const updateInputs = () => {
      document.querySelectorAll("input").forEach(input => {
        if (input.type === "checkbox" || input.type === "radio") {
          input.toggleAttribute("checked", input.checked);
        } else {
          input.setAttribute("value", input.value);
        }
      });
    };

    const updateTextareas = () => {
      document.querySelectorAll("textarea").forEach(textarea => {
        textarea.innerHTML = textarea.value;
      });
    };

    const updateSelects = () => {
      document.querySelectorAll("select").forEach(select => {
        Array.from(select.children).forEach(option => {
          if (option.tagName === "OPTION") {
            option.toggleAttribute("selected", (option as HTMLOptionElement).selected);
          }
        });
      });
    };

    const convertCanvases = () => {
      document.querySelectorAll("canvas").forEach(canvas => {
        const img = document.createElement("img");
        img.src = canvas.toDataURL("image/png");
        img.style.cssText = "max-width: 100%;";
        img.classList.add("isNeedRemove");
        canvas.parentNode?.insertBefore(img, canvas.nextElementSibling);
      });
    };

    updateInputs();
    updateTextareas();
    updateSelects();
    convertCanvases();

    return this.dom.outerHTML;
  }

  private writeIframe(content: string): void {
    const iframe = document.createElement("iframe");
    iframe.id = "myIframe";
    iframe.style.cssText = "position:absolute;width:0;height:0;top:-10px;left:-10px;";

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(content);
    doc.close();

    // 清理临时添加的图片
    document.querySelectorAll(".isNeedRemove").forEach(img => img.remove());

    iframe.onload = () => {
      this.conf.printBeforeFn?.({ doc });
      this.toPrint(iframe.contentWindow!);

      setTimeout(() => {
        document.body.removeChild(iframe);
        this.conf.printDoneCallBack?.();
      }, 100);
    };
  }

  private toPrint(frameWindow: Window): void {
    try {
      setTimeout(() => {
        frameWindow.focus();
        try {
          frameWindow.document.execCommand("print", false, null);
        } catch {
          frameWindow.print();
        }
        frameWindow.close();
      }, 10);
    } catch (err) {
      console.error(err);
    }
  }

  private isDOM(obj: any): boolean {
    return typeof HTMLElement === "object"
      ? obj instanceof HTMLElement
      : obj?.nodeType === 1 && typeof obj.nodeName === "string";
  }

  private setDomHeight(selectors: string[]): void {
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        (el as HTMLElement).style.height = `${el.clientHeight}px`;
      });
    });
  }
}
