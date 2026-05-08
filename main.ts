import { Plugin, Modal, Notice, TFile, App, PluginSettingTab, Setting } from "obsidian";

interface ReadingRecordManagerSettings {
    enableHideFinished: boolean;
    hideFinishedDays: number;
}

const DEFAULT_SETTINGS: ReadingRecordManagerSettings = {
    enableHideFinished: true,
    hideFinishedDays: 7
};

// Helper to format Date as "YYYY-MM-DD"
function formatDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// Helper to format Date as "YYYY-MM-DD HH:mm"
function formatDateTime(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// Helper to sanitize filenames by removing forbidden OS/Obsidian characters
function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

// Helper to sanitize and format volume strings
function sanitizeVolume(vol: string): string {
    const clean = vol.replace(/[\\/:*?"<>|]/g, "").trim();
    if (/^\d+$/.test(clean)) {
        // Pad numbers to 2 digits for cleaner ordering in file systems (e.g. "01")
        return clean.padStart(2, "0");
    }
    return clean;
}

// Helper to escape double quotes for frontmatter properties
function escapeYamlString(str: string): string {
    return str.replace(/"/g, '\\"');
}

// Custom Add Book Modal Class
class AddBookModal extends Modal {
    onSubmit: (result: {
        title: string;
        author: string;
        seriesName: string;
        volume: string;
        category: string;
        subcategory: string;
        status: string;
    }) => void;

    // Data structures for auto-suggest
    uniqueSeries: Map<string, { author: string; title: string; maxVolume: number; originalVolumeStr: string }> = new Map();
    uniqueAuthors: Set<string> = new Set();
    uniqueCategories: Set<string> = new Set();
    uniqueSubcategories: Set<string> = new Set();

    constructor(app: App, onSubmit: (result: any) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.scanExistingBooks();
    }

    scanExistingBooks() {
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter) continue;

            const isInBooksFolder = file.path.startsWith("Books/");
            const hasStatus = "status" in frontmatter;

            if (isInBooksFolder || hasStatus) {
                const title = frontmatter.title || file.basename;
                const author = frontmatter.author || "";
                const series = frontmatter.series || "";
                const volume = frontmatter.volume || "";
                const category = frontmatter.category || "";
                const subcategory = frontmatter.subcategory || "";

                if (author && author.trim()) {
                    this.uniqueAuthors.add(author.trim());
                }

                if (category && category.trim()) {
                    this.uniqueCategories.add(category.trim());
                }

                if (subcategory && subcategory.trim()) {
                    this.uniqueSubcategories.add(subcategory.trim());
                }

                if (series && series.trim()) {
                    const seriesKey = series.trim();
                    const cleanAuthor = author ? author.trim() : "";
                    const cleanTitle = title ? title.trim() : "";

                    // Extract the numerical parts for volume comparison
                    const volDigits = volume.replace(/\D/g, "");
                    const volNum = volDigits ? parseInt(volDigits, 10) : NaN;

                    const existing = this.uniqueSeries.get(seriesKey);
                    if (existing) {
                        if (!isNaN(volNum) && (isNaN(existing.maxVolume) || volNum > existing.maxVolume)) {
                            existing.maxVolume = volNum;
                            existing.originalVolumeStr = volume;
                        }
                        if (!existing.author && cleanAuthor) {
                            existing.author = cleanAuthor;
                        }
                    } else {
                        this.uniqueSeries.set(seriesKey, {
                            author: cleanAuthor,
                            title: cleanTitle,
                            maxVolume: isNaN(volNum) ? -1 : volNum,
                            originalVolumeStr: volume
                        });
                    }
                }
            }
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("rrm-modal");

        // Modal Title
        contentEl.createEl("h2", { text: "📚 Add New Book", cls: "rrm-modal-title" });

        // Form Container
        const form = contentEl.createDiv({ cls: "rrm-form" });

        // Series and Volume Side-by-Side row
        const row = form.createDiv({ cls: "rrm-row" });

        // Series Field
        const seriesGroup = row.createDiv({ cls: "rrm-field-group" });
        seriesGroup.createEl("label", { text: "Series (Optional)" });
        const seriesInput = seriesGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., One Piece"
        });
        seriesInput.setAttribute("id", "rrm-input-series");
        seriesInput.setAttribute("name", "series");
        seriesInput.setAttribute("autocomplete", "off");

        // Volume Field
        const volumeGroup = row.createDiv({ cls: "rrm-field-group" });
        volumeGroup.createEl("label", { text: "Volume (Optional)" });
        const volumeInput = volumeGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., 01, 102"
        });
        volumeInput.setAttribute("id", "rrm-input-volume");
        volumeInput.setAttribute("name", "volume");
        volumeInput.setAttribute("autocomplete", "off");

        // Book Title Field
        const titleGroup = form.createDiv({ cls: "rrm-field-group" });
        titleGroup.createEl("label", { text: "Book Title *" });
        const titleInput = titleGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., The Hobbit"
        });
        titleInput.setAttribute("id", "rrm-input-title");
        titleInput.setAttribute("name", "title");
        titleInput.setAttribute("autocomplete", "off");

        // Author Field
        const authorGroup = form.createDiv({ cls: "rrm-field-group" });
        authorGroup.createEl("label", { text: "Author *" });
        const authorInput = authorGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., J.R.R. Tolkien"
        });
        authorInput.setAttribute("id", "rrm-input-author");
        authorInput.setAttribute("name", "author");
        authorInput.setAttribute("autocomplete", "off");

        // Category and Subcategory Side-by-Side row
        const categoryRow = form.createDiv({ cls: "rrm-row" });

        // Category Field
        const categoryGroup = categoryRow.createDiv({ cls: "rrm-field-group" });
        categoryGroup.createEl("label", { text: "Category (Optional)" });
        const categoryInput = categoryGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., 漫画, 技術書"
        });
        categoryInput.setAttribute("id", "rrm-input-category");
        categoryInput.setAttribute("name", "category");
        categoryInput.setAttribute("autocomplete", "off");

        // Subcategory Field
        const subcategoryGroup = categoryRow.createDiv({ cls: "rrm-field-group" });
        subcategoryGroup.createEl("label", { text: "Subcategory (Optional)" });
        const subcategoryInput = subcategoryGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., 少年漫画, 技術書-JS"
        });
        subcategoryInput.setAttribute("id", "rrm-input-subcategory");
        subcategoryInput.setAttribute("name", "subcategory");
        subcategoryInput.setAttribute("autocomplete", "off");

        // Status Field
        const statusGroup = form.createDiv({ cls: "rrm-field-group" });
        statusGroup.createEl("label", { text: "Reading Status" });
        const statusSelect = statusGroup.createEl("select", { cls: "rrm-select" });
        statusSelect.createEl("option", { text: "To Read", value: "To Read" });
        statusSelect.createEl("option", { text: "Reading", value: "Reading" });
        statusSelect.createEl("option", { text: "Finished", value: "Finished" });

        // Action Buttons
        const buttonsContainer = form.createDiv({ cls: "rrm-buttons" });

        const cancelButton = buttonsContainer.createEl("button", {
            text: "Cancel",
            cls: "rrm-btn rrm-btn-secondary",
            type: "button"
        });
        cancelButton.addEventListener("click", () => this.close());

        const submitButton = buttonsContainer.createEl("button", {
            text: "Create Entry",
            cls: "rrm-btn rrm-btn-primary",
            type: "submit"
        });

        // Auto-focus Series Input first to allow quick entry for sequel titles
        setTimeout(() => seriesInput.focus(), 50);

        // Define Suggestor helper
        const createSuggestor = (
            inputEl: HTMLInputElement,
            getItems: (query: string) => { primary: string; secondary?: string; data: any }[],
            onSelect: (item: any) => void
        ) => {
            const parent = inputEl.parentElement;
            if (!parent) return;

            let suggestEl: HTMLDivElement | null = null;
            let selectedIndex = -1;
            let currentItems: any[] = [];

            const closeSuggest = () => {
                if (suggestEl) {
                    suggestEl.remove();
                    suggestEl = null;
                }
                selectedIndex = -1;
            };

            const renderSuggest = (items: { primary: string; secondary?: string; data: any }[]) => {
                closeSuggest();
                if (items.length === 0) return;

                currentItems = items;
                suggestEl = document.createElement("div");
                suggestEl.className = "rrm-suggest-container";

                items.forEach((item, index) => {
                    const itemEl = suggestEl!.createDiv({ cls: "rrm-suggest-item" });
                    
                    const textContainer = itemEl.createDiv({ cls: "rrm-suggest-item-text" });
                    textContainer.createSpan({ cls: "rrm-suggest-item-main", text: item.primary });
                    if (item.secondary) {
                        textContainer.createSpan({ cls: "rrm-suggest-item-sub", text: item.secondary });
                    }

                    itemEl.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect(item.data);
                        closeSuggest();
                    });

                    itemEl.addEventListener("mouseenter", () => {
                        updateSelection(index);
                    });
                });

                parent.appendChild(suggestEl);
            };

            const updateSelection = (index: number) => {
                if (!suggestEl) return;
                const items = suggestEl.querySelectorAll(".rrm-suggest-item");
                items.forEach((el, i) => {
                    if (i === index) {
                        el.addClass("is-selected");
                    } else {
                        el.removeClass("is-selected");
                    }
                });
                selectedIndex = index;

                const activeEl = items[index] as HTMLElement;
                if (activeEl) {
                    activeEl.scrollIntoView({ block: "nearest" });
                }
            };

            inputEl.addEventListener("input", () => {
                const query = inputEl.value.trim();
                const filtered = getItems(query);
                renderSuggest(filtered);
            });

            // Focus trigger
            inputEl.addEventListener("focus", () => {
                const query = inputEl.value.trim();
                const filtered = getItems(query);
                renderSuggest(filtered);
            });

            // Clean blur trigger - dismisses the popup when clicking or tabbing away
            inputEl.addEventListener("blur", () => {
                setTimeout(() => {
                    closeSuggest();
                }, 180);
            });

            inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.isComposing) return;
                if (!suggestEl) return;

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const nextIndex = (selectedIndex + 1) % currentItems.length;
                    updateSelection(nextIndex);
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prevIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
                    updateSelection(prevIndex);
                } else if (e.key === "Enter" && selectedIndex >= 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(currentItems[selectedIndex].data);
                    closeSuggest();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    closeSuggest();
                }
            });
        };

        // Helper to increment volume strings cleanly
        const getNextVolume = (currentVolStr: string): string => {
            if (!currentVolStr) return "01";
            
            const numRegex = /(\d+)(?!.*\d)/; // match last digits block
            const match = currentVolStr.match(numRegex);
            
            if (match) {
                const numStr = match[1];
                const num = parseInt(numStr, 10);
                const nextNum = num + 1;
                
                let nextNumStr = String(nextNum);
                if (numStr.startsWith("0") && numStr.length > nextNumStr.length) {
                    nextNumStr = nextNumStr.padStart(numStr.length, "0");
                }
                
                return currentVolStr.replace(numRegex, nextNumStr);
            }
            
            return currentVolStr + " 2"; // fallback
        };

        // Helper to update Title automatically based on Series & Volume
        let userHasModifiedTitle = false;
        titleInput.addEventListener("input", () => {
            if (titleInput.value.trim() === "") {
                userHasModifiedTitle = false;
            } else {
                userHasModifiedTitle = true;
            }
        });

        const updateAutoTitle = () => {
            if (userHasModifiedTitle) return;
            
            const seriesVal = seriesInput.value.trim();
            const volumeVal = volumeInput.value.trim();
            
            if (seriesVal) {
                if (volumeVal) {
                    titleInput.value = `${seriesVal} ${volumeVal}`;
                } else {
                    titleInput.value = seriesVal;
                }
            }
        };

        // Listen for raw inputs to auto-update Title
        seriesInput.addEventListener("input", updateAutoTitle);
        volumeInput.addEventListener("input", updateAutoTitle);

        // Initialize Title suggestor for quick formatting selection
        createSuggestor(
            titleInput,
            (query: string) => {
                const matches: any[] = [];
                const seriesVal = seriesInput.value.trim();
                const volumeVal = volumeInput.value.trim();

                if (seriesVal) {
                    const variants: string[] = [];
                    if (volumeVal) {
                        variants.push(`${seriesVal} ${volumeVal}`);
                        variants.push(`${seriesVal} Vol. ${volumeVal}`);
                        variants.push(`${seriesVal} ${volumeVal}巻`);
                    } else {
                        variants.push(seriesVal);
                    }

                    variants.forEach(variant => {
                        if (!query || variant.toLowerCase().includes(query.toLowerCase())) {
                            matches.push({
                                primary: variant,
                                secondary: "✨ Generated from Series & Volume",
                                data: variant
                            });
                        }
                    });
                }
                return matches.slice(0, 5);
            },
            (title: string) => {
                titleInput.value = title;
                userHasModifiedTitle = true; // Block further auto-updates as user made an explicit choice
            }
        );

        // Initialize Series suggestor
        createSuggestor(
            seriesInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueSeries.forEach((info, name) => {
                    if (!q || name.toLowerCase().includes(q)) {
                        let secondary = "";
                        if (info.author) secondary += `By: ${info.author}`;
                        if (info.originalVolumeStr) {
                            secondary += secondary ? ` | Last Vol: ${info.originalVolumeStr}` : `Last Vol: ${info.originalVolumeStr}`;
                        }
                        matches.push({
                            primary: name,
                            secondary: secondary,
                            data: { name, ...info }
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (data: any) => {
                seriesInput.value = data.name;
                
                if (data.author && !authorInput.value.trim()) {
                    authorInput.value = data.author;
                }
                
                if (data.originalVolumeStr) {
                    volumeInput.value = getNextVolume(data.originalVolumeStr);
                } else {
                    volumeInput.value = "01";
                }

                // Automatically update Title based on selected Series and generated Volume
                updateAutoTitle();

                // Focus Volume Input and select its text
                setTimeout(() => {
                    volumeInput.focus();
                    volumeInput.select();
                }, 50);
            }
        );

        // Initialize Author suggestor
        createSuggestor(
            authorInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueAuthors.forEach((author) => {
                    if (!q || author.toLowerCase().includes(q)) {
                        matches.push({
                            primary: author,
                            data: author
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (author: string) => {
                authorInput.value = author;
                // Move focus to Title input if it's empty
                setTimeout(() => {
                    if (!titleInput.value.trim()) {
                        titleInput.focus();
                    }
                }, 50);
            }
        );

        // Initialize Category suggestor
        createSuggestor(
            categoryInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueCategories.forEach((cat) => {
                    if (!q || cat.toLowerCase().includes(q)) {
                        matches.push({
                            primary: cat,
                            data: cat
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (cat: string) => {
                categoryInput.value = cat;
                setTimeout(() => {
                    subcategoryInput.focus();
                }, 50);
            }
        );

        // Initialize Subcategory suggestor
        createSuggestor(
            subcategoryInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueSubcategories.forEach((sub) => {
                    if (!q || sub.toLowerCase().includes(q)) {
                        matches.push({
                            primary: sub,
                            data: sub
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (sub: string) => {
                subcategoryInput.value = sub;
            }
        );

        // Submit action
        const submitAction = () => {
            const titleVal = titleInput.value.trim();
            const authorVal = authorInput.value.trim();
            const seriesVal = seriesInput.value.trim();
            const volumeVal = volumeInput.value.trim();
            const categoryVal = categoryInput.value.trim();
            const subcategoryVal = subcategoryInput.value.trim();
            const statusVal = statusSelect.value;

            if (!titleVal) {
                new Notice("Error: Book Title is a required field.");
                titleInput.focus();
                return;
            }
            if (!authorVal) {
                new Notice("Error: Author is a required field.");
                authorInput.focus();
                return;
            }

            this.close();
            this.onSubmit({
                title: titleVal,
                author: authorVal,
                seriesName: seriesVal,
                volume: volumeVal,
                category: categoryVal,
                subcategory: subcategoryVal,
                status: statusVal
            });
        };

        submitButton.addEventListener("click", submitAction);

        // Handle Enter key inside input fields for quick submission
        const handleEnter = (e: KeyboardEvent) => {
            if (e.isComposing) return;
            if (e.key === "Enter") {
                submitAction();
            }
        };
        titleInput.addEventListener("keydown", handleEnter);
        authorInput.addEventListener("keydown", handleEnter);
        seriesInput.addEventListener("keydown", handleEnter);
        volumeInput.addEventListener("keydown", handleEnter);
        categoryInput.addEventListener("keydown", handleEnter);
        subcategoryInput.addEventListener("keydown", handleEnter);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Custom Edit Book Modal Class
class EditBookModal extends Modal {
    initialData: {
        title: string;
        author: string;
        seriesName: string;
        volume: string;
        category: string;
        subcategory: string;
        status: string;
    };
    onSubmit: (result: {
        title: string;
        author: string;
        seriesName: string;
        volume: string;
        category: string;
        subcategory: string;
        status: string;
    }) => void;

    // Data structures for auto-suggest
    uniqueSeries: Map<string, { author: string; title: string; maxVolume: number; originalVolumeStr: string }> = new Map();
    uniqueAuthors: Set<string> = new Set();
    uniqueCategories: Set<string> = new Set();
    uniqueSubcategories: Set<string> = new Set();

    constructor(app: App, initialData: any, onSubmit: (result: any) => void) {
        super(app);
        this.initialData = initialData;
        this.onSubmit = onSubmit;
        this.scanExistingBooks();
    }

    scanExistingBooks() {
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter) continue;

            const isInBooksFolder = file.path.startsWith("Books/");
            const hasStatus = "status" in frontmatter;

            if (isInBooksFolder || hasStatus) {
                const title = frontmatter.title || file.basename;
                const author = frontmatter.author || "";
                const series = frontmatter.series || "";
                const volume = frontmatter.volume || "";
                const category = frontmatter.category || "";
                const subcategory = frontmatter.subcategory || "";

                if (author && author.trim()) {
                    this.uniqueAuthors.add(author.trim());
                }

                if (category && category.trim()) {
                    this.uniqueCategories.add(category.trim());
                }

                if (subcategory && subcategory.trim()) {
                    this.uniqueSubcategories.add(subcategory.trim());
                }

                if (series && series.trim()) {
                    const seriesKey = series.trim();
                    const cleanAuthor = author ? author.trim() : "";
                    const cleanTitle = title ? title.trim() : "";

                    // Extract the numerical parts for volume comparison
                    const volDigits = volume.replace(/\D/g, "");
                    const volNum = volDigits ? parseInt(volDigits, 10) : NaN;

                    const existing = this.uniqueSeries.get(seriesKey);
                    if (existing) {
                        if (!isNaN(volNum) && (isNaN(existing.maxVolume) || volNum > existing.maxVolume)) {
                            existing.maxVolume = volNum;
                            existing.originalVolumeStr = volume;
                        }
                        if (!existing.author && cleanAuthor) {
                            existing.author = cleanAuthor;
                        }
                    } else {
                        this.uniqueSeries.set(seriesKey, {
                            author: cleanAuthor,
                            title: cleanTitle,
                            maxVolume: isNaN(volNum) ? -1 : volNum,
                            originalVolumeStr: volume
                        });
                    }
                }
            }
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("rrm-modal");

        // Modal Title
        contentEl.createEl("h2", { text: "✍️ Edit Book Properties", cls: "rrm-modal-title" });

        // Form Container
        const form = contentEl.createDiv({ cls: "rrm-form" });

        // Series and Volume Side-by-Side row
        const row = form.createDiv({ cls: "rrm-row" });

        // Series Field
        const seriesGroup = row.createDiv({ cls: "rrm-field-group" });
        seriesGroup.createEl("label", { text: "Series (Optional)" });
        const seriesInput = seriesGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., One Piece"
        });
        seriesInput.setAttribute("id", "rrm-input-series");
        seriesInput.setAttribute("name", "series");
        seriesInput.setAttribute("autocomplete", "off");
        seriesInput.value = this.initialData.seriesName || "";

        // Volume Field
        const volumeGroup = row.createDiv({ cls: "rrm-field-group" });
        volumeGroup.createEl("label", { text: "Volume (Optional)" });
        const volumeInput = volumeGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., 01, 102"
        });
        volumeInput.setAttribute("id", "rrm-input-volume");
        volumeInput.setAttribute("name", "volume");
        volumeInput.setAttribute("autocomplete", "off");
        volumeInput.value = this.initialData.volume || "";

        // Book Title Field
        const titleGroup = form.createDiv({ cls: "rrm-field-group" });
        titleGroup.createEl("label", { text: "Book Title *" });
        const titleInput = titleGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., The Hobbit"
        });
        titleInput.setAttribute("id", "rrm-input-title");
        titleInput.setAttribute("name", "title");
        titleInput.setAttribute("autocomplete", "off");
        titleInput.value = this.initialData.title || "";

        // Author Field
        const authorGroup = form.createDiv({ cls: "rrm-field-group" });
        authorGroup.createEl("label", { text: "Author *" });
        const authorInput = authorGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., J.R.R. Tolkien"
        });
        authorInput.setAttribute("id", "rrm-input-author");
        authorInput.setAttribute("name", "author");
        authorInput.setAttribute("autocomplete", "off");
        authorInput.value = this.initialData.author || "";

        // Category and Subcategory Side-by-Side row
        const categoryRow = form.createDiv({ cls: "rrm-row" });

        // Category Field
        const categoryGroup = categoryRow.createDiv({ cls: "rrm-field-group" });
        categoryGroup.createEl("label", { text: "Category (Optional)" });
        const categoryInput = categoryGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., 漫画, 技術書"
        });
        categoryInput.setAttribute("id", "rrm-input-category");
        categoryInput.setAttribute("name", "category");
        categoryInput.setAttribute("autocomplete", "off");
        categoryInput.value = this.initialData.category || "";

        // Subcategory Field
        const subcategoryGroup = categoryRow.createDiv({ cls: "rrm-field-group" });
        subcategoryGroup.createEl("label", { text: "Subcategory (Optional)" });
        const subcategoryInput = subcategoryGroup.createEl("input", {
            type: "text",
            cls: "rrm-input",
            placeholder: "e.g., 少年漫画, 技術書-JS"
        });
        subcategoryInput.setAttribute("id", "rrm-input-subcategory");
        subcategoryInput.setAttribute("name", "subcategory");
        subcategoryInput.setAttribute("autocomplete", "off");
        subcategoryInput.value = this.initialData.subcategory || "";

        // Status Field
        const statusGroup = form.createDiv({ cls: "rrm-field-group" });
        statusGroup.createEl("label", { text: "Reading Status" });
        const statusSelect = statusGroup.createEl("select", { cls: "rrm-select" });
        statusSelect.createEl("option", { text: "To Read", value: "To Read" });
        statusSelect.createEl("option", { text: "Reading", value: "Reading" });
        statusSelect.createEl("option", { text: "Finished", value: "Finished" });
        statusSelect.value = this.initialData.status || "To Read";

        // Action Buttons
        const buttonsContainer = form.createDiv({ cls: "rrm-buttons" });

        const cancelButton = buttonsContainer.createEl("button", {
            text: "Cancel",
            cls: "rrm-btn rrm-btn-secondary",
            type: "button"
        });
        cancelButton.addEventListener("click", () => this.close());

        const submitButton = buttonsContainer.createEl("button", {
            text: "Save Changes",
            cls: "rrm-btn rrm-btn-primary",
            type: "submit"
        });

        // Focus Series Input first
        setTimeout(() => seriesInput.focus(), 50);

        // Define Suggestor helper
        const createSuggestor = (
            inputEl: HTMLInputElement,
            getItems: (query: string) => { primary: string; secondary?: string; data: any }[],
            onSelect: (item: any) => void
        ) => {
            const parent = inputEl.parentElement;
            if (!parent) return;

            let suggestEl: HTMLDivElement | null = null;
            let selectedIndex = -1;
            let currentItems: any[] = [];

            const closeSuggest = () => {
                if (suggestEl) {
                    suggestEl.remove();
                    suggestEl = null;
                }
                selectedIndex = -1;
            };

            const renderSuggest = (items: { primary: string; secondary?: string; data: any }[]) => {
                closeSuggest();
                if (items.length === 0) return;

                currentItems = items;
                suggestEl = document.createElement("div");
                suggestEl.className = "rrm-suggest-container";

                items.forEach((item, index) => {
                    const itemEl = suggestEl!.createDiv({ cls: "rrm-suggest-item" });
                    
                    const textContainer = itemEl.createDiv({ cls: "rrm-suggest-item-text" });
                    textContainer.createSpan({ cls: "rrm-suggest-item-main", text: item.primary });
                    if (item.secondary) {
                        textContainer.createSpan({ cls: "rrm-suggest-item-sub", text: item.secondary });
                    }

                    itemEl.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect(item.data);
                        closeSuggest();
                    });

                    itemEl.addEventListener("mouseenter", () => {
                        updateSelection(index);
                    });
                });

                parent.appendChild(suggestEl);
            };

            const updateSelection = (index: number) => {
                if (!suggestEl) return;
                const items = suggestEl.querySelectorAll(".rrm-suggest-item");
                items.forEach((el, i) => {
                    if (i === index) {
                        el.addClass("is-selected");
                    } else {
                        el.removeClass("is-selected");
                    }
                });
                selectedIndex = index;

                const activeEl = items[index] as HTMLElement;
                if (activeEl) {
                    activeEl.scrollIntoView({ block: "nearest" });
                }
            };

            inputEl.addEventListener("input", () => {
                const query = inputEl.value.trim();
                const filtered = getItems(query);
                renderSuggest(filtered);
            });

            // Focus trigger
            inputEl.addEventListener("focus", () => {
                const query = inputEl.value.trim();
                const filtered = getItems(query);
                renderSuggest(filtered);
            });

            // Clean blur trigger - dismisses the popup when clicking or tabbing away
            inputEl.addEventListener("blur", () => {
                setTimeout(() => {
                    closeSuggest();
                }, 180);
            });

            inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.isComposing) return;
                if (!suggestEl) return;

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const nextIndex = (selectedIndex + 1) % currentItems.length;
                    updateSelection(nextIndex);
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prevIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
                    updateSelection(prevIndex);
                } else if (e.key === "Enter" && selectedIndex >= 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(currentItems[selectedIndex].data);
                    closeSuggest();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    closeSuggest();
                }
            });
        };

        // Helper to increment volume strings cleanly
        const getNextVolume = (currentVolStr: string): string => {
            if (!currentVolStr) return "01";
            
            const numRegex = /(\d+)(?!.*\d)/; // match last digits block
            const match = currentVolStr.match(numRegex);
            
            if (match) {
                const numStr = match[1];
                const num = parseInt(numStr, 10);
                const nextNum = num + 1;
                
                let nextNumStr = String(nextNum);
                if (numStr.startsWith("0") && numStr.length > nextNumStr.length) {
                    nextNumStr = nextNumStr.padStart(numStr.length, "0");
                }
                
                return currentVolStr.replace(numRegex, nextNumStr);
            }
            
            return currentVolStr + " 2"; // fallback
        };

        // Helper to update Title automatically based on Series & Volume
        let userHasModifiedTitle = this.initialData.title !== "";
        titleInput.addEventListener("input", () => {
            if (titleInput.value.trim() === "") {
                userHasModifiedTitle = false;
            } else {
                userHasModifiedTitle = true;
            }
        });

        const updateAutoTitle = () => {
            if (userHasModifiedTitle) return;
            
            const seriesVal = seriesInput.value.trim();
            const volumeVal = volumeInput.value.trim();
            
            if (seriesVal) {
                if (volumeVal) {
                    titleInput.value = `${seriesVal} ${volumeVal}`;
                } else {
                    titleInput.value = seriesVal;
                }
            }
        };

        // Listen for raw inputs to auto-update Title
        seriesInput.addEventListener("input", updateAutoTitle);
        volumeInput.addEventListener("input", updateAutoTitle);

        // Initialize Title suggestor for quick formatting selection
        createSuggestor(
            titleInput,
            (query: string) => {
                const matches: any[] = [];
                const seriesVal = seriesInput.value.trim();
                const volumeVal = volumeInput.value.trim();

                if (seriesVal) {
                    const variants: string[] = [];
                    if (volumeVal) {
                        variants.push(`${seriesVal} ${volumeVal}`);
                        variants.push(`${seriesVal} Vol. ${volumeVal}`);
                        variants.push(`${seriesVal} ${volumeVal}巻`);
                    } else {
                        variants.push(seriesVal);
                    }

                    variants.forEach(variant => {
                        if (!query || variant.toLowerCase().includes(query.toLowerCase())) {
                            matches.push({
                                primary: variant,
                                secondary: "✨ Generated from Series & Volume",
                                data: variant
                            });
                        }
                    });
                }
                return matches.slice(0, 5);
            },
            (title: string) => {
                titleInput.value = title;
                userHasModifiedTitle = true; // Block further auto-updates as user made an explicit choice
            }
        );

        // Initialize Series suggestor
        createSuggestor(
            seriesInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueSeries.forEach((info, name) => {
                    if (!q || name.toLowerCase().includes(q)) {
                        let secondary = "";
                        if (info.author) secondary += `By: ${info.author}`;
                        if (info.originalVolumeStr) {
                            secondary += secondary ? ` | Last Vol: ${info.originalVolumeStr}` : `Last Vol: ${info.originalVolumeStr}`;
                        }
                        matches.push({
                            primary: name,
                            secondary: secondary,
                            data: { name, ...info }
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (data: any) => {
                seriesInput.value = data.name;
                
                if (data.author && !authorInput.value.trim()) {
                    authorInput.value = data.author;
                }
                
                if (data.originalVolumeStr) {
                    volumeInput.value = getNextVolume(data.originalVolumeStr);
                } else {
                    volumeInput.value = "01";
                }

                // Automatically update Title based on selected Series and generated Volume
                updateAutoTitle();

                // Focus Volume Input and select its text
                setTimeout(() => {
                    volumeInput.focus();
                    volumeInput.select();
                }, 50);
            }
        );

        // Initialize Author suggestor
        createSuggestor(
            authorInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueAuthors.forEach((author) => {
                    if (!q || author.toLowerCase().includes(q)) {
                        matches.push({
                            primary: author,
                            data: author
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (author: string) => {
                authorInput.value = author;
                // Move focus to Title input if it's empty
                setTimeout(() => {
                    if (!titleInput.value.trim()) {
                        titleInput.focus();
                    }
                }, 50);
            }
        );

        // Initialize Category suggestor
        createSuggestor(
            categoryInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueCategories.forEach((cat) => {
                    if (!q || cat.toLowerCase().includes(q)) {
                        matches.push({
                            primary: cat,
                            data: cat
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (cat: string) => {
                categoryInput.value = cat;
                setTimeout(() => {
                    subcategoryInput.focus();
                }, 50);
            }
        );

        // Initialize Subcategory suggestor
        createSuggestor(
            subcategoryInput,
            (query: string) => {
                const q = query.toLowerCase();
                const matches: any[] = [];
                this.uniqueSubcategories.forEach((sub) => {
                    if (!q || sub.toLowerCase().includes(q)) {
                        matches.push({
                            primary: sub,
                            data: sub
                        });
                    }
                });
                return matches.slice(0, 8);
            },
            (sub: string) => {
                subcategoryInput.value = sub;
            }
        );

        // Submit action
        const submitAction = () => {
            const titleVal = titleInput.value.trim();
            const authorVal = authorInput.value.trim();
            const seriesVal = seriesInput.value.trim();
            const volumeVal = volumeInput.value.trim();
            const categoryVal = categoryInput.value.trim();
            const subcategoryVal = subcategoryInput.value.trim();
            const statusVal = statusSelect.value;

            if (!titleVal) {
                new Notice("Error: Book Title is a required field.");
                titleInput.focus();
                return;
            }
            if (!authorVal) {
                new Notice("Error: Author is a required field.");
                authorInput.focus();
                return;
            }

            this.close();
            this.onSubmit({
                title: titleVal,
                author: authorVal,
                seriesName: seriesVal,
                volume: volumeVal,
                category: categoryVal,
                subcategory: subcategoryVal,
                status: statusVal
            });
        };

        submitButton.addEventListener("click", submitAction);

        // Handle Enter key inside input fields for quick submission
        const handleEnter = (e: KeyboardEvent) => {
            if (e.isComposing) return;
            if (e.key === "Enter") {
                submitAction();
            }
        };
        titleInput.addEventListener("keydown", handleEnter);
        authorInput.addEventListener("keydown", handleEnter);
        seriesInput.addEventListener("keydown", handleEnter);
        volumeInput.addEventListener("keydown", handleEnter);
        categoryInput.addEventListener("keydown", handleEnter);
        subcategoryInput.addEventListener("keydown", handleEnter);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Recursive directory creation helper
async function createFolderRecursively(app: App, path: string): Promise<void> {
    const parts = path.split("/").filter(p => p !== "");
    let currentPath = "";
    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const abstractFile = app.vault.getAbstractFileByPath(currentPath);
        if (!abstractFile) {
            try {
                await app.vault.createFolder(currentPath);
            } catch (e) {
                // Ignore folder creation errors (might be created simultaneously)
                console.error(`Failed to create folder ${currentPath}:`, e);
            }
        }
    }
}

// Master Reading Record Manager Plugin Class
export default class ReadingRecordManager extends Plugin {
    settings: ReadingRecordManagerSettings = DEFAULT_SETTINGS;

    async onload() {
        console.log("Loading Reading Record Manager plugin...");
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new ReadingRecordManagerSettingTab(this.app, this));

        // 1. Add Book Command
        this.addCommand({
            id: "add-book",
            name: "Add New Book",
            callback: () => this.openAddBookModal()
        });

        // 2. Status Toggle Command
        this.addCommand({
            id: "toggle-status",
            name: "Toggle Current Book Status",
            callback: () => this.toggleCurrentBookStatus()
        });

        // 3. Update Master List Command
        this.addCommand({
            id: "update-master-list",
            name: "Update Master Reading List",
            callback: () => this.updateMasterReadingList(true)
        });

        // 5. Edit Book Properties Command
        this.addCommand({
            id: "edit-book-properties",
            name: "Edit Current Book Properties",
            callback: () => this.openEditBookModal()
        });

        // Add Ribbon Icons (Sidebar buttons)
        this.addRibbonIcon("book-open", "Add New Book", () => {
            this.openAddBookModal();
        });

        this.addRibbonIcon("pencil", "Edit Current Book Properties", () => {
            this.openEditBookModal();
        });

        this.addRibbonIcon("check-square", "Toggle Reading Status", () => {
            this.toggleCurrentBookStatus();
        });

        // 4. Watch metadata changes to auto-update Master Reading List (solves automatic tracking)
        this.registerEvent(
            this.app.metadataCache.on("changed", async (file) => {
                if (file.path === "Books/Master Reading List.md") return;

                const isInBooksFolder = file.path.startsWith("Books/");
                const cache = this.app.metadataCache.getFileCache(file);
                const hasStatus = cache?.frontmatter && "status" in cache.frontmatter;

                if (isInBooksFolder || hasStatus) {
                    await this.updateMasterReadingList(false);
                }
            })
        );
    }

    onunload() {
        console.log("Unloading Reading Record Manager plugin...");
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Refresh master list automatically when settings change
        await this.updateMasterReadingList(false);
    }

    // Opens the Modal to add a new book and creates the Markdown file
    openAddBookModal() {
        new AddBookModal(this.app, async (result) => {
            const { title, author, seriesName, volume, category, subcategory, status } = result;

            // Resolve file paths and directories
            let parentFolder = "Books";
            let fileName = "";

            if (seriesName && seriesName.trim()) {
                const cleanSeries = sanitizeFilename(seriesName.trim());
                parentFolder = `Books/${cleanSeries}`;
                if (volume && volume.trim()) {
                    const cleanVolume = sanitizeVolume(volume.trim());
                    fileName = `Vol_${cleanVolume}.md`;
                } else {
                    fileName = `${sanitizeFilename(title.trim())}.md`;
                }
            } else {
                fileName = `${sanitizeFilename(title.trim())}.md`;
            }

            const fullPath = `${parentFolder}/${fileName}`;

            // Check if file already exists (duplicate prevention)
            const fileExists = this.app.vault.getAbstractFileByPath(fullPath);
            if (fileExists) {
                new Notice(`Error: A book file already exists at "${fullPath}". Action cancelled.`);
                return;
            }

            // Create folders recursively
            await createFolderRecursively(this.app, parentFolder);

            // Generate Frontmatter & Content structure
            const updatedTime = formatDateTime(new Date());
            const escapedTitle = escapeYamlString(title.trim());
            const escapedAuthor = escapeYamlString(author.trim());
            const escapedSeries = seriesName ? escapeYamlString(seriesName.trim()) : "";
            const escapedVolume = volume ? escapeYamlString(volume.trim()) : "";
            const escapedCategory = category ? escapeYamlString(category.trim()) : "";
            const escapedSubcategory = subcategory ? escapeYamlString(subcategory.trim()) : "";

            let fileContentLines = [
                "---",
                `title: "${escapedTitle}"`,
                `status: "${status}"`,
                `author: "${escapedAuthor}"`,
                `series: "${escapedSeries}"`,
                `volume: "${escapedVolume}"`,
                `category: "${escapedCategory}"`,
                `subcategory: "${escapedSubcategory}"`,
                `updated: ${updatedTime}`
            ];

            if (status === "Finished") {
                const endDate = formatDate(new Date());
                fileContentLines.push(`end_date: ${endDate}`);
            }

            fileContentLines.push("---");
            fileContentLines.push("");
            fileContentLines.push("## Reading Notes");
            fileContentLines.push("");
            fileContentLines.push("- ");
            fileContentLines.push("");
            fileContentLines.push("## Final Review");
            fileContentLines.push("");

            const fileContent = fileContentLines.join("\n");

            try {
                // Create the markdown file in Obsidian
                const newFile = await this.app.vault.create(fullPath, fileContent);
                new Notice(`Book successfully added: "${title}"`);

                // Immediately open the newly created file in the active tab
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(newFile);

                // Auto-refresh the master reading list in background
                await this.updateMasterReadingList(false);
            } catch (error) {
                console.error("Failed to create book file:", error);
                new Notice("Error: Failed to create book file. Check console for details.");
            }
        }).open();
    }

    // Opens the Modal to edit properties of the currently active book file
    openEditBookModal() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("Please open a book markdown file first.");
            return;
        }

        const cache = this.app.metadataCache.getFileCache(activeFile);
        const frontmatter = cache?.frontmatter;

        const isInBooksFolder = activeFile.path.startsWith("Books/");
        const hasStatus = frontmatter && "status" in frontmatter;

        if (!isInBooksFolder && !hasStatus) {
            new Notice("The active file is not recognized as a book record.");
            return;
        }

        const initialData = {
            title: frontmatter?.title || activeFile.basename,
            author: frontmatter?.author || "",
            seriesName: frontmatter?.series || "",
            volume: frontmatter?.volume || "",
            category: frontmatter?.category || "",
            subcategory: frontmatter?.subcategory || "",
            status: frontmatter?.status || "To Read"
        };

        new EditBookModal(this.app, initialData, async (result) => {
            const { title, author, seriesName, volume, category, subcategory, status } = result;

            // Resolve folder and file paths
            let parentFolder = "Books";
            let fileName = "";

            if (seriesName && seriesName.trim()) {
                const cleanSeries = sanitizeFilename(seriesName.trim());
                parentFolder = `Books/${cleanSeries}`;
                if (volume && volume.trim()) {
                    const cleanVolume = sanitizeVolume(volume.trim());
                    fileName = `Vol_${cleanVolume}.md`;
                } else {
                    fileName = `${sanitizeFilename(title.trim())}.md`;
                }
            } else {
                fileName = `${sanitizeFilename(title.trim())}.md`;
            }

            const newPath = `${parentFolder}/${fileName}`;

            try {
                // If the path needs to change, rename/move the file first
                if (newPath !== activeFile.path) {
                    await createFolderRecursively(this.app, parentFolder);

                    const fileExists = this.app.vault.getAbstractFileByPath(newPath);
                    if (fileExists) {
                        new Notice(`Error: A book file already exists at "${newPath}". Move/Rename cancelled.`);
                        return;
                    }

                    await this.app.fileManager.renameFile(activeFile, newPath);
                }

                // Now update the frontmatter properties of the book
                await this.app.fileManager.processFrontMatter(activeFile, (fm) => {
                    fm.title = title.trim();
                    fm.status = status;
                    fm.author = author.trim();
                    fm.series = seriesName.trim();
                    fm.volume = volume.trim();
                    fm.category = category.trim();
                    fm.subcategory = subcategory.trim();
                    fm.updated = formatDateTime(new Date());

                    if (status === "Finished") {
                        if (!fm.end_date) {
                            fm.end_date = formatDate(new Date());
                        }
                    } else {
                        delete fm.end_date;
                    }
                });

                new Notice(`Book properties successfully updated for "${title}"`);

                // Auto-refresh the master reading list in background
                await this.updateMasterReadingList(false);
            } catch (error) {
                console.error("Failed to update book properties:", error);
                new Notice("Error: Failed to update book properties. Check console for details.");
            }
        }).open();
    }

    // Toggles reading status of current file (circular toggle)
    async toggleCurrentBookStatus() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("Please open a book markdown file first.");
            return;
        }

        const cache = this.app.metadataCache.getFileCache(activeFile);
        const frontmatter = cache?.frontmatter;

        const isInBooksFolder = activeFile.path.startsWith("Books/");
        const hasStatus = frontmatter && "status" in frontmatter;

        if (!isInBooksFolder && !hasStatus) {
            new Notice("The active file is not recognized as a book record.");
            return;
        }

        const currentStatus = frontmatter?.status || "To Read";
        let nextStatus = "To Read";

        if (currentStatus === "To Read") {
            nextStatus = "Reading";
        } else if (currentStatus === "Reading") {
            nextStatus = "Finished";
        } else if (currentStatus === "Finished") {
            nextStatus = "To Read";
        }

        try {
            await this.app.fileManager.processFrontMatter(activeFile, (fm) => {
                fm.status = nextStatus;
                fm.updated = formatDateTime(new Date());

                if (nextStatus === "Finished") {
                    fm.end_date = formatDate(new Date());
                } else {
                    // Remove end_date if we move back from Finished
                    delete fm.end_date;
                }
            });

            new Notice(`"${activeFile.basename}" status updated to: ${nextStatus}`);

            // Auto-refresh the master reading list in background
            await this.updateMasterReadingList(false);
        } catch (error) {
            console.error("Failed to update status in frontmatter:", error);
            new Notice("Error: Failed to update book status.");
        }
    }

    // Generates or updates the "Master Reading List" Markdown Table
    async updateMasterReadingList(showNotification = true) {
        const masterListPath = "Books/Master Reading List.md";
        const files = this.app.vault.getMarkdownFiles();
        
        interface BookRecord {
            file: TFile;
            title: string;
            author: string;
            series: string;
            volume: string;
            category: string;
            subcategory: string;
            status: string;
            updated: string;
            updatedParsed: number;
            endDate: string;
        }

        const books: BookRecord[] = [];

        for (const file of files) {
            // Skip the master list file itself
            if (file.path === masterListPath) continue;

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;

            const isInBooksFolder = file.path.startsWith("Books/");
            const hasStatus = frontmatter && "status" in frontmatter;

            if (isInBooksFolder || hasStatus) {
                const status = frontmatter?.status || "To Read";
                const author = frontmatter?.author || "Unknown";
                const series = frontmatter?.series || "";
                const volume = frontmatter?.volume || "";
                const category = frontmatter?.category || "";
                const subcategory = frontmatter?.subcategory || "";
                const updated = frontmatter?.updated || "";
                const endDate = frontmatter?.end_date || "";
                const title = frontmatter?.title || file.basename;

                // Parse updated date to sort in descending order
                let updatedParsed = 0;
                if (updated) {
                    updatedParsed = Date.parse(updated.replace(" ", "T"));
                    if (isNaN(updatedParsed)) {
                        updatedParsed = file.stat.mtime;
                    }
                } else {
                    updatedParsed = file.stat.mtime;
                }

                books.push({
                    file,
                    title,
                    author,
                    series,
                    volume,
                    category,
                    subcategory,
                    status,
                    updated: updated || formatDate(new Date(file.stat.mtime)),
                    updatedParsed,
                    endDate
                });
            }
        }

        // Sort books by updated date descending (most recently updated first)
        books.sort((a, b) => b.updatedParsed - a.updatedParsed);

        // Compute Statistics
        const total = books.length;
        const toRead = books.filter(b => b.status === "To Read").length;
        const reading = books.filter(b => b.status === "Reading").length;
        const finished = books.filter(b => b.status === "Finished").length;

        // Apply finished hiding filter if enabled
        const filteredBooks: BookRecord[] = [];
        let hiddenFinishedCount = 0;

        if (this.settings.enableHideFinished) {
            const now = Date.now();
            const hideMs = this.settings.hideFinishedDays * 24 * 60 * 60 * 1000;

            for (const book of books) {
                if (book.status === "Finished") {
                    let finishTime = NaN;
                    if (book.endDate) {
                        finishTime = Date.parse(book.endDate);
                    } else if (book.updated) {
                        finishTime = Date.parse(book.updated.replace(" ", "T"));
                    }

                    if (isNaN(finishTime)) {
                        finishTime = book.file.stat.mtime;
                    }

                    if (now - finishTime > hideMs) {
                        hiddenFinishedCount++;
                        continue; // Skip rendering in list
                    }
                }
                filteredBooks.push(book);
            }
        } else {
            filteredBooks.push(...books);
        }

        // Generate Markdown table with beautiful styling badges
        const lines: string[] = [];
        lines.push("# 📚 Master Reading List");
        lines.push("");
        lines.push("> [!NOTE]");
        lines.push("> This list is automatically updated when creating or toggling a book. You can also run the **Reading Record Manager: Update Master Reading List** command at any time.");
        lines.push("");
        lines.push("### 📊 Reading Statistics");
        lines.push("");
        lines.push(`- **Total Books:** ${total}`);
        lines.push(`- **⏳ To Read:** ${toRead}`);
        lines.push(`- **📖 Reading:** ${reading}`);
        lines.push(`- **✅ Finished:** ${finished}`);
        if (hiddenFinishedCount > 0) {
            lines.push(`- **👻 Archived/Hidden:** ${hiddenFinishedCount} (Finished books older than ${this.settings.hideFinishedDays} days are hidden from the directory list below. You can change this in the plugin settings.)`);
        }
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push("### 📖 Book Directory");
        lines.push("");
        lines.push("| Book / Volume | Author | Series | Vol | Category | Subcategory | Status | Last Updated | End Date |");
        lines.push("| :--- | :--- | :--- | :---: | :--- | :--- | :---: | :--- | :--- |");

        for (const book of filteredBooks) {
            // Determine display name for link
            let displayName = book.title;
            if (book.series) {
                if (book.volume) {
                    displayName = `${book.series} (Vol ${book.volume})`;
                } else {
                    displayName = `${book.series} - ${book.title}`;
                }
            }

            // Escape the pipe symbol so the markdown table parser doesn't split on it
            const fileLink = `[[${book.file.path}\\|${displayName}]]`;

            // HTML badges for statuses using class names in styles.css
            let statusBadge = "";
            if (book.status === "To Read") {
                statusBadge = `<span class="rrm-badge rrm-badge-to-read">To Read</span>`;
            } else if (book.status === "Reading") {
                statusBadge = `<span class="rrm-badge rrm-badge-reading">Reading</span>`;
            } else if (book.status === "Finished") {
                statusBadge = `<span class="rrm-badge rrm-badge-finished">Finished</span>`;
            } else {
                statusBadge = book.status;
            }

            lines.push(`| ${fileLink} | ${book.author} | ${book.series || "-"} | ${book.volume || "-"} | ${book.category || "-"} | ${book.subcategory || "-"} | ${statusBadge} | ${book.updated} | ${book.endDate || "-"} |`);
        }

        const masterListContent = lines.join("\n");

        try {
            // Ensure folder Books exists
            await createFolderRecursively(this.app, "Books");

            // Write to Master Reading List file
            const existingMasterList = this.app.vault.getAbstractFileByPath(masterListPath);
            if (existingMasterList instanceof TFile) {
                await this.app.vault.modify(existingMasterList, masterListContent);
            } else {
                await this.app.vault.create(masterListPath, masterListContent);
            }

            if (showNotification) {
                new Notice("Master Reading List successfully updated!");
            }
        } catch (error) {
            console.error("Failed to update Master Reading List:", error);
            if (showNotification) {
                new Notice("Error: Failed to update Master Reading List.");
            }
        }
    }
}

class ReadingRecordManagerSettingTab extends PluginSettingTab {
    plugin: ReadingRecordManager;

    constructor(app: App, plugin: ReadingRecordManager) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Reading Record Manager Settings" });

        new Setting(containerEl)
            .setName("Hide Finished Books")
            .setDesc("Automatically hide finished books from the Master Reading List after a certain period of time.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableHideFinished)
                    .onChange(async (value) => {
                        this.plugin.settings.enableHideFinished = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Days to Hide After Finished")
            .setDesc("The number of days to wait before hiding finished books from the list.")
            .addText((text) =>
                text
                    .setPlaceholder("7")
                    .setValue(String(this.plugin.settings.hideFinishedDays))
                    .onChange(async (value) => {
                        const num = parseInt(value, 10);
                        if (!isNaN(num) && num >= 0) {
                            this.plugin.settings.hideFinishedDays = num;
                            await this.plugin.saveSettings();
                        }
                    })
            );
    }
}
