import { Plugin, Modal, Notice, TFile, App, PluginSettingTab, Setting, ItemView, WorkspaceLeaf } from "obsidian";

interface ReadingRecordManagerSettings {
    enableHideFinished: boolean;
    hideFinishedDays: number;
    enableAutoUpdate: boolean;
}

const DEFAULT_SETTINGS: ReadingRecordManagerSettings = {
    enableHideFinished: true,
    hideFinishedDays: 7,
    enableAutoUpdate: true
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
        rating: number;
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

            if (isInBooksFolder) {
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
        authorGroup.createEl("label", { text: "Author (Optional)" });
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
        statusSelect.createEl("option", { text: "On Hold", value: "On Hold" });

        // Rating Field
        const ratingGroup = form.createDiv({ cls: "rrm-field-group" });
        ratingGroup.createEl("label", { text: "Rating" });
        const ratingInputContainer = ratingGroup.createDiv({ cls: "rrm-rating-input" });
        let selectedRating = 0;
        const stars: HTMLSpanElement[] = [];
        for (let i = 1; i <= 5; i++) {
            const star = ratingInputContainer.createSpan({ text: "★", cls: "rrm-star" });
            star.addEventListener("click", () => {
                if (selectedRating === i) {
                    selectedRating = 0; // Toggle off if clicked again
                } else {
                    selectedRating = i;
                }
                updateStarsDisplay();
            });
            stars.push(star);
        }
        const updateStarsDisplay = () => {
            stars.forEach((star, idx) => {
                if (idx < selectedRating) {
                    star.addClass("is-selected");
                } else {
                    star.removeClass("is-selected");
                }
            });
        };

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


            this.close();
            this.onSubmit({
                title: titleVal,
                author: authorVal,
                seriesName: seriesVal,
                volume: volumeVal,
                category: categoryVal,
                subcategory: subcategoryVal,
                status: statusVal,
                rating: selectedRating
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
        rating: number;
    };
    onSubmit: (result: {
        title: string;
        author: string;
        seriesName: string;
        volume: string;
        category: string;
        subcategory: string;
        status: string;
        rating: number;
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

            if (isInBooksFolder) {
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
        authorGroup.createEl("label", { text: "Author (Optional)" });
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
        statusSelect.createEl("option", { text: "On Hold (保留中)", value: "On Hold" });
        statusSelect.value = this.initialData.status || "To Read";

        // Rating Field
        const ratingGroup = form.createDiv({ cls: "rrm-field-group" });
        ratingGroup.createEl("label", { text: "Rating" });
        const ratingInputContainer = ratingGroup.createDiv({ cls: "rrm-rating-input" });
        let selectedRating = this.initialData.rating || 0;
        const stars: HTMLSpanElement[] = [];
        for (let i = 1; i <= 5; i++) {
            const star = ratingInputContainer.createSpan({ text: "★", cls: "rrm-star" });
            star.addEventListener("click", () => {
                if (selectedRating === i) {
                    selectedRating = 0; // Toggle off if clicked again
                } else {
                    selectedRating = i;
                }
                updateStarsDisplay();
            });
            stars.push(star);
        }
        const updateStarsDisplay = () => {
            stars.forEach((star, idx) => {
                if (idx < selectedRating) {
                    star.addClass("is-selected");
                } else {
                    star.removeClass("is-selected");
                }
            });
        };
        updateStarsDisplay(); // Call initial pre-fill

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


            this.close();
            this.onSubmit({
                title: titleVal,
                author: authorVal,
                seriesName: seriesVal,
                volume: volumeVal,
                category: categoryVal,
                subcategory: subcategoryVal,
                status: statusVal,
                rating: selectedRating
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

// Modal to change status and rating of a book
class StatusRatingModal extends Modal {
    file: TFile;
    initialStatus: string;
    initialRating: number;
    onSubmit: (status: string, rating: number) => void;

    constructor(app: App, file: TFile, initialStatus: string, initialRating: number, onSubmit: (status: string, rating: number) => void) {
        super(app);
        this.file = file;
        this.initialStatus = initialStatus;
        this.initialRating = initialRating;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("rrm-modal");

        contentEl.createEl("h2", { text: `Update Status & Rating`, cls: "rrm-modal-title" });
        contentEl.createEl("p", { text: this.file.basename, cls: "rrm-modal-subtitle" });

        const form = contentEl.createDiv({ cls: "rrm-form" });

        // Status Field
        const statusGroup = form.createDiv({ cls: "rrm-field-group" });
        statusGroup.createEl("label", { text: "Reading Status" });
        const statusSelect = statusGroup.createEl("select", { cls: "rrm-select" });
        const statuses = ["To Read", "Reading", "Finished", "On Hold"];
        statuses.forEach(status => {
            const option = statusSelect.createEl("option", { text: status, value: status });
            if (status === this.initialStatus) {
                option.selected = true;
            }
        });

        // Rating Field
        const ratingGroup = form.createDiv({ cls: "rrm-field-group" });
        ratingGroup.createEl("label", { text: "Rating" });
        const ratingInputContainer = ratingGroup.createDiv({ cls: "rrm-rating-input" });
        let selectedRating = this.initialRating;
        const stars: HTMLSpanElement[] = [];
        for (let i = 1; i <= 5; i++) {
            const star = ratingInputContainer.createSpan({ text: "★", cls: "rrm-star" });
            star.addEventListener("click", () => {
                if (selectedRating === i) {
                    selectedRating = 0; // Toggle off if clicked again
                } else {
                    selectedRating = i;
                }
                updateStarsDisplay();
            });
            stars.push(star);
        }
        const updateStarsDisplay = () => {
            stars.forEach((star, idx) => {
                if (idx < selectedRating) {
                    star.addClass("is-selected");
                } else {
                    star.removeClass("is-selected");
                }
            });
        };
        updateStarsDisplay();

        // Action Buttons
        const buttonsContainer = form.createDiv({ cls: "rrm-buttons" });

        const cancelButton = buttonsContainer.createEl("button", {
            text: "Cancel",
            cls: "rrm-btn rrm-btn-secondary",
            type: "button"
        });
        cancelButton.addEventListener("click", () => this.close());

        const submitButton = buttonsContainer.createEl("button", {
            text: "Update",
            cls: "rrm-btn rrm-btn-primary",
            type: "submit"
        });

        submitButton.addEventListener("click", (e) => {
            e.preventDefault();
            this.close();
            this.onSubmit(statusSelect.value, selectedRating);
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Quick Action Control Panel Modal
class QuickActionModal extends Modal {
    plugin: ReadingRecordManager;

    constructor(app: App, plugin: ReadingRecordManager) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("rrm-modal");

        contentEl.createEl("h2", {
            text: "📚 Reading Record Manager",
            cls: "rrm-modal-title"
        });

        const grid = contentEl.createDiv({ cls: "rrm-quick-menu-grid" });

        const addCard = (icon: string, title: string, desc: string, onClick: () => void) => {
            const card = grid.createDiv({ cls: "rrm-quick-menu-card" });
            card.createEl("span", { text: icon, cls: "rrm-quick-menu-icon" });
            card.createEl("div", { text: title, cls: "rrm-quick-menu-title" });
            card.createEl("div", { text: desc, cls: "rrm-quick-menu-desc" });
            card.addEventListener("click", () => {
                this.close();
                onClick();
            });
        };

        addCard("➕", "Add New Book", "Create a new book or volume entry", () => {
            this.plugin.openAddBookModal();
        });

        addCard("✏️", "Edit Properties", "Update metadata, rename or relocate file", () => {
            this.plugin.openEditBookModal();
        });

        addCard("🔄", "Change Status/Rating", "Update reading status and star rating", () => {
            this.plugin.toggleCurrentBookStatus();
        });

        addCard("📊", "Open Sidebar", "Show the visual sidebar tracker panel", () => {
            this.plugin.activateSidebarView();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Sidebar View Type Identifier
export const VIEW_TYPE_READING_STATUS = "reading-status-sidebar-view";

// Custom Sidebar Reading Tracker View
class ReadingStatusSidebarView extends ItemView {
    plugin: ReadingRecordManager;
    activeCategory: string = "All";
    activeMode: "tracker" | "retrospective" = "tracker";

    constructor(leaf: WorkspaceLeaf, plugin: ReadingRecordManager) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_READING_STATUS;
    }

    getDisplayText(): string {
        return "Book Tracker";
    }

    getIcon(): string {
        return "book-open";
    }

    async onOpen() {
        this.registerEvent(this.app.metadataCache.on("changed", () => this.updateView()));
        await this.updateView();
    }

    async onClose() {
        // Nothing to clean up
    }

    async updateView() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("rrm-sidebar-container");

        // Add header
        const header = contentEl.createDiv({ cls: "rrm-sidebar-header" });
        const titleEl = header.createEl("h3", { text: "📚 Book Tracker" });

        // Fetch books data
        const files = this.app.vault.getMarkdownFiles();
        interface BookItem {
            file: TFile;
            title: string;
            author: string;
            status: string;
            series: string;
            volume: string;
            category: string;
            subcategory: string;
            rating: number;
            endDate: string;
            updated: string;
        }
        const books: BookItem[] = [];

        for (const file of files) {
            if (file.path === "Books/Master Reading List.md") continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;
            const isInBooksFolder = file.path.startsWith("Books/");

            if (isInBooksFolder) {
                books.push({
                    file,
                    title: fm?.title || file.basename,
                    author: fm?.author || "Unknown",
                    status: fm?.status || "To Read",
                    series: fm?.series || "",
                    volume: fm?.volume || "",
                    category: fm?.category || "",
                    subcategory: fm?.subcategory || "",
                    rating: fm?.rating || 0,
                    endDate: fm?.end_date || "",
                    updated: fm?.updated || ""
                });
            }
        }

        const total = books.length;
        titleEl.setText(`📚 Book Tracker (${total})`);

        // Mode switch buttons
        const modeSelector = contentEl.createDiv({ cls: "rrm-sidebar-mode-selector" });
        const trackerBtn = modeSelector.createEl("button", {
            text: "📝 Tracker",
            cls: `rrm-sidebar-mode-btn ${this.activeMode === "tracker" ? "is-active" : ""}`
        });
        trackerBtn.addEventListener("click", () => {
            this.activeMode = "tracker";
            this.updateView();
        });
        const retroBtn = modeSelector.createEl("button", {
            text: "✨ Retro",
            cls: `rrm-sidebar-mode-btn ${this.activeMode === "retrospective" ? "is-active" : ""}`
        });
        retroBtn.addEventListener("click", () => {
            this.activeMode = "retrospective";
            this.updateView();
        });

        if (this.activeMode === "tracker") {
            // Categories list for dynamic tab creation
            const categoriesSet = new Set<string>();
            books.forEach(b => {
                if (b.category && b.category.trim()) {
                    categoriesSet.add(b.category.trim());
                }
            });
            const categories = Array.from(categoriesSet).sort();

            // 1. Horizontal Category Tabs View
            const tabsContainer = contentEl.createDiv({ cls: "rrm-sidebar-tabs" });

            // "All" tab
            const allTab = tabsContainer.createEl("button", { text: "All", cls: `rrm-sidebar-tab ${this.activeCategory === "All" ? "is-active" : ""}` });
            allTab.addEventListener("click", () => {
                this.activeCategory = "All";
                this.updateView();
            });

            // Specific category tabs
            categories.forEach(cat => {
                const tab = tabsContainer.createEl("button", { text: cat, cls: `rrm-sidebar-tab ${this.activeCategory === cat ? "is-active" : ""}` });
                tab.addEventListener("click", () => {
                    this.activeCategory = cat;
                    this.updateView();
                });
            });

            // Filter books based on active category
            const filteredBooks = this.activeCategory === "All"
                ? books
                : books.filter(b => b.category === this.activeCategory);

            const toRead = filteredBooks.filter(b => b.status === "To Read").length;
            const reading = filteredBooks.filter(b => b.status === "Reading").length;
            const finished = filteredBooks.filter(b => b.status === "Finished").length;

            // Create Stats section
            const statsGrid = contentEl.createDiv({ cls: "rrm-sidebar-stats" });

            const addStat = (label: string, count: number, cls: string) => {
                const stat = statsGrid.createDiv({ cls: `rrm-sidebar-stat-card ${cls}` });
                stat.createDiv({ text: label, cls: "rrm-sidebar-stat-label" });
                stat.createDiv({ text: String(count), cls: "rrm-sidebar-stat-count" });
            };

            addStat("⏳ To Read", toRead, "to-read");
            addStat("📖 Reading", reading, "reading");
            addStat("✅ Finished", finished, "finished");

            // Helper function to render a list of book cards
            const renderBookList = (booksList: BookItem[], title: string, emptyMsg: string) => {
                contentEl.createEl("h4", { text: title, cls: "rrm-sidebar-section-title" });
                if (booksList.length === 0) {
                    contentEl.createEl("div", { text: emptyMsg, cls: "rrm-sidebar-empty-text" });
                } else {
                    const listContainer = contentEl.createDiv({ cls: "rrm-sidebar-list" });
                    for (const book of booksList) {
                        const item = listContainer.createDiv({ cls: "rrm-sidebar-item" });

                        const infoContainer = item.createDiv({ cls: "rrm-sidebar-item-info" });

                        let displayName = book.title;
                        if (book.series) {
                            displayName = book.volume ? `${book.series} (${book.volume})` : book.series;
                        }

                        const link = infoContainer.createEl("a", { text: displayName, cls: "rrm-sidebar-item-title" });
                        link.addEventListener("click", async (e) => {
                            e.preventDefault();
                            const leaf = this.app.workspace.getLeaf(false);
                            await leaf.openFile(book.file);
                        });

                        infoContainer.createEl("div", { text: `By: ${book.author}`, cls: "rrm-sidebar-item-author" });

                        // Add Star Display
                        if (book.rating > 0) {
                            infoContainer.createDiv({
                                text: "★".repeat(book.rating),
                                cls: "rrm-stars-display"
                            });
                        }

                        // Actions Container
                        const actionsRow = item.createDiv({ cls: "rrm-sidebar-item-actions" });

                        // Add Status/Rating Update Button
                        const btn = actionsRow.createEl("button", { text: "⚙ Update", cls: "rrm-sidebar-item-btn" });
                        btn.addEventListener("click", async () => {
                            await this.plugin.toggleBookStatus(book.file);
                            await this.updateView();
                        });

                        // Next Volume Button (Series only, if in Finished state)
                        if (book.status === "Finished" && book.series) {
                            const nextVolBtn = actionsRow.createEl("button", {
                                cls: "rrm-sidebar-item-btn",
                                text: "⏭️ Next Vol"
                            });
                            nextVolBtn.title = "Create next volume note automatically";
                            nextVolBtn.addEventListener("click", async () => {
                                await this.plugin.createAndOpenNextVolume(book);
                                await this.updateView();
                            });
                        }
                    }
                }
            };

            // Sections
            renderBookList(filteredBooks.filter(b => b.status === "Reading"), "📖 Currently Reading", "No books in progress.");
            renderBookList(filteredBooks.filter(b => b.status === "To Read"), "⏳ To Read", "No books on your shelf.");
            
            const finishedBooksToRender = filteredBooks.filter(b => {
                if (b.status !== "Finished") return false;
                if (!this.plugin.settings.enableHideFinished) return true;

                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const hideDays = this.plugin.settings.hideFinishedDays;

                let finishDate: Date | null = null;
                if (b.endDate) {
                    const parts = b.endDate.split("-");
                    if (parts.length === 3) {
                        finishDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                }
                
                if (!finishDate && b.updated) {
                    const datePart = String(b.updated).split(" ")[0];
                    const parts = datePart.split("-");
                    if (parts.length === 3) {
                        finishDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                }

                if (!finishDate) {
                    const mtime = new Date(b.file.stat.mtime);
                    finishDate = new Date(mtime.getFullYear(), mtime.getMonth(), mtime.getDate());
                }

                const diffDays = Math.floor((today.getTime() - finishDate.getTime()) / (24 * 60 * 60 * 1000));

                return diffDays < hideDays;
            });
            
            renderBookList(finishedBooksToRender, "✅ Finished", "No completed books yet.");
        } else {
            // Compute retrospective stats
            const totalFinished = books.filter(b => b.status === "Finished").length;
            const ratedBooks = books.filter(b => b.rating > 0);
            const avgRating = ratedBooks.length > 0
                ? ratedBooks.reduce((sum, b) => sum + b.rating, 0) / ratedBooks.length
                : 0;

            // Rendering stats summary cards
            const statsSummary = contentEl.createDiv({ cls: "rrm-retro-stats-summary" });

            const addRetroStat = (label: string, value: string) => {
                const card = statsSummary.createDiv({ cls: "rrm-retro-stats-card" });
                card.createDiv({ text: label, cls: "rrm-retro-stats-label" });
                card.createDiv({ text: value, cls: "rrm-retro-stats-value" });
            };

            addRetroStat("Total Books", String(books.length));
            addRetroStat("✅ Finished", String(totalFinished));
            addRetroStat("⭐ Avg Rating", avgRating > 0 ? `${avgRating.toFixed(1)} ★` : "-");

            // --- Section 1: Favorite Categories ---
            contentEl.createEl("h4", { text: "🏷️ Favorite Categories", cls: "rrm-sidebar-section-title" });

            const catMap = new Map<string, { total: number; ratingSum: number; ratingCount: number }>();
            books.forEach(b => {
                const cat = b.category.trim() || "Uncategorized";
                if (!catMap.has(cat)) {
                    catMap.set(cat, { total: 0, ratingSum: 0, ratingCount: 0 });
                }
                const stat = catMap.get(cat)!;
                stat.total++;
                if (b.rating > 0) {
                    stat.ratingSum += b.rating;
                    stat.ratingCount++;
                }
            });

            const catStats = Array.from(catMap.entries()).map(([name, stat]) => {
                const avg = stat.ratingCount > 0 ? stat.ratingSum / stat.ratingCount : 0;
                return { name, total: stat.total, avg };
            }).sort((a, b) => b.total - a.total); // Sort by item count descending

            if (catStats.length === 0) {
                contentEl.createDiv({ text: "No categories recorded.", cls: "rrm-sidebar-empty-text" });
            } else {
                const listContainer = contentEl.createDiv({ cls: "rrm-sidebar-list" });
                catStats.slice(0, 5).forEach(cat => {
                    const item = listContainer.createDiv({ cls: "rrm-retro-category-item" });

                    const labelDiv = item.createDiv({ cls: "rrm-retro-category-label" });
                    labelDiv.createSpan({ text: cat.name, cls: "rrm-retro-category-name" });

                    const ratingText = cat.avg > 0 ? `Avg: ${cat.avg.toFixed(1)} ★` : "Unrated";
                    labelDiv.createSpan({ text: `${cat.total} books (${ratingText})`, cls: "rrm-retro-category-count" });

                    const progressBg = item.createDiv({ cls: "rrm-retro-progress-bg" });
                    const progressFill = progressBg.createDiv({ cls: "rrm-retro-progress-fill" });
                    progressFill.style.width = cat.avg > 0 ? `${(cat.avg / 5) * 100}%` : "0%";
                });
            }

            // --- Section 2: Hall of Fame (★4 and ★5) ---
            contentEl.createEl("h4", { text: "🏆 Hall of Fame", cls: "rrm-sidebar-section-title" });

            const hallOfFame = books
                .filter(b => b.rating >= 4)
                .sort((a, b) => b.rating - a.rating);

            if (hallOfFame.length === 0) {
                contentEl.createDiv({ text: "No books rated ★4 or ★5 yet.", cls: "rrm-sidebar-empty-text" });
            } else {
                const listContainer = contentEl.createDiv({ cls: "rrm-sidebar-list" });
                hallOfFame.slice(0, 5).forEach(book => {
                    const item = listContainer.createDiv({ cls: "rrm-retro-hall-item" });

                    const infoContainer = item.createDiv({ cls: "rrm-retro-hall-info" });
                    let displayName = book.title;
                    if (book.series) {
                        displayName = book.volume ? `${book.series} (${book.volume})` : book.series;
                    }
                    const link = infoContainer.createEl("a", { text: displayName, cls: "rrm-retro-hall-title" });
                    link.addEventListener("click", async (e) => {
                        e.preventDefault();
                        const leaf = this.app.workspace.getLeaf(false);
                        await leaf.openFile(book.file);
                    });

                    infoContainer.createDiv({ text: `By: ${book.author}`, cls: "rrm-retro-hall-meta" });

                    item.createDiv({ text: "★".repeat(book.rating), cls: "rrm-retro-hall-stars" });
                });
            }

            // --- Section 3: Monthly Log ---
            contentEl.createEl("h4", { text: "📅 Monthly Achievements", cls: "rrm-sidebar-section-title" });

            const monthlyMap = new Map<string, number>();
            books.filter(b => b.status === "Finished").forEach(b => {
                let month = "Unknown";
                if (b.endDate) {
                    month = b.endDate.substring(0, 7); // "YYYY-MM"
                } else if (b.updated) {
                    month = b.updated.substring(0, 7); // "YYYY-MM"
                }
                monthlyMap.set(month, (monthlyMap.get(month) || 0) + 1);
            });

            const monthlyStats = Array.from(monthlyMap.entries())
                .sort((a, b) => b[0].localeCompare(a[0])); // Sort descending by month

            if (monthlyStats.length === 0) {
                contentEl.createDiv({ text: "No completed books recorded yet.", cls: "rrm-sidebar-empty-text" });
            } else {
                const listContainer = contentEl.createDiv({ cls: "rrm-sidebar-list" });
                monthlyStats.slice(0, 5).forEach(([month, count]) => {
                    const item = listContainer.createDiv({ cls: "rrm-retro-monthly-item" });
                    item.createDiv({ text: month, cls: "rrm-retro-monthly-month" });
                    item.createDiv({ text: `${count} books`, cls: "rrm-retro-monthly-count" });
                });
            }
        }

        // Add quick command action list
        contentEl.createEl("h4", { text: "⚡ Quick Actions", cls: "rrm-sidebar-section-title" });
        const quickActions = contentEl.createDiv({ cls: "rrm-sidebar-quick-actions" });

        const addAction = (label: string, icon: string, onClick: () => void) => {
            const btn = quickActions.createEl("button", { cls: "rrm-sidebar-action-btn" });
            btn.createEl("span", { text: icon, cls: "rrm-sidebar-action-icon" });
            btn.createEl("span", { text: label });
            btn.addEventListener("click", onClick);
        };

        addAction("Add Book", "➕", () => this.plugin.openAddBookModal());
        addAction("Dashboard", "📊", () => {
            const file = this.app.vault.getAbstractFileByPath("Books/Master Reading List.md");
            if (file instanceof TFile) {
                this.app.workspace.getLeaf(false).openFile(file);
            } else {
                this.plugin.updateMasterReadingList(true);
            }
        });
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

        // 0. Open Control Panel Command
        this.addCommand({
            id: "open-control-panel",
            name: "Open Control Panel",
            callback: () => this.openQuickActionModal()
        });

        // 1. Add Book Command
        this.addCommand({
            id: "add-book",
            name: "Add New Book",
            callback: () => this.openAddBookModal()
        });

        // 2. Status / Rating Update Command
        this.addCommand({
            id: "toggle-status",
            name: "Change Current Book Status/Rating",
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

        // Add Single Ribbon Icon to open central Control Panel (avoids sidebar clutter)
        this.addRibbonIcon("book-open", "Reading Record Manager Panel", () => {
            this.openQuickActionModal();
        });

        // 4. Watch metadata changes to auto-update Master Reading List (solves automatic tracking)
        this.registerEvent(
            this.app.metadataCache.on("changed", async (file) => {
                if (!this.settings.enableAutoUpdate) return;
                if (file.path === "Books/Master Reading List.md") return;

                const isInBooksFolder = file.path.startsWith("Books/");

                if (isInBooksFolder) {
                    await this.updateMasterReadingList(false);
                }
            })
        );

        // 6. Show Reading Tracker Sidebar Command
        this.addCommand({
            id: "open-reading-tracker-sidebar",
            name: "Show Reading Tracker Sidebar",
            callback: () => this.activateSidebarView()
        });

        // Register custom sidebar view
        this.registerView(
            VIEW_TYPE_READING_STATUS,
            (leaf) => new ReadingStatusSidebarView(leaf, this)
        );

        // Register File Context Menu (Right-click in file explorer)
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (!(file instanceof TFile) || file.extension !== "md") return;

                const isInBooksFolder = file.path.startsWith("Books/");

                if (isInBooksFolder) {
                    menu.addItem((item) => {
                        item
                            .setTitle("Change Status/Rating")
                            .setIcon("check-square")
                            .onClick(async () => {
                                await this.toggleBookStatus(file);
                            });
                    });

                    menu.addItem((item) => {
                        item
                            .setTitle("Edit Book Properties")
                            .setIcon("pencil")
                            .onClick(() => {
                                this.openEditBookModalForFile(file);
                            });
                    });
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

    // Opens the central Control Panel
    openQuickActionModal() {
        new QuickActionModal(this.app, this).open();
    }

    // Activates or reveals the Reading Tracker Sidebar view
    async activateSidebarView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_READING_STATUS);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // Put it in the right sidebar (right leaf)
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: VIEW_TYPE_READING_STATUS,
                    active: true,
                });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    // Opens the Modal to add a new book and creates the Markdown file
    openAddBookModal() {
        new AddBookModal(this.app, async (result) => {
            const { title, author, seriesName, volume, category, subcategory, status, rating } = result;

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
                `rating: ${rating}`,
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

    // Opens the Modal to edit properties of a specific book file
    openEditBookModalForFile(file: TFile) {
        if (!file || file.extension !== "md") {
            new Notice("Please select a book markdown file first.");
            return;
        }

        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        const isInBooksFolder = file.path.startsWith("Books/");

        if (!isInBooksFolder) {
            new Notice("The file is not recognized as a book record.");
            return;
        }

        const initialData = {
            title: frontmatter?.title || file.basename,
            author: frontmatter?.author || "",
            seriesName: frontmatter?.series || "",
            volume: frontmatter?.volume || "",
            category: frontmatter?.category || "",
            subcategory: frontmatter?.subcategory || "",
            status: frontmatter?.status || "To Read",
            rating: frontmatter?.rating || 0
        };

        new EditBookModal(this.app, initialData, async (result) => {
            const { title, author, seriesName, volume, category, subcategory, status, rating } = result;

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
                if (newPath !== file.path) {
                    await createFolderRecursively(this.app, parentFolder);

                    const fileExists = this.app.vault.getAbstractFileByPath(newPath);
                    if (fileExists) {
                        new Notice(`Error: A book file already exists at "${newPath}". Move/Rename cancelled.`);
                        return;
                    }

                    await this.app.fileManager.renameFile(file, newPath);
                }

                // Now update the frontmatter properties of the book
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    fm.title = title.trim();
                    fm.status = status;
                    fm.author = author.trim();
                    fm.series = seriesName.trim();
                    fm.volume = volume.trim();
                    fm.category = category.trim();
                    fm.subcategory = subcategory.trim();
                    fm.rating = rating;
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

    // Opens the Modal to edit properties of the currently active book file
    openEditBookModal() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("Please open a book markdown file first.");
            return;
        }
        this.openEditBookModalForFile(activeFile);
    }

    // Opens a popup to change status and rating of a specific file
    async toggleBookStatus(file: TFile, forcedStatus?: string) {
        if (!file || file.extension !== "md") {
            new Notice("Please select a book markdown file first.");
            return;
        }

        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        const isInBooksFolder = file.path.startsWith("Books/");

        if (!isInBooksFolder) {
            new Notice("The file is not recognized as a book record.");
            return;
        }

        const currentStatus = frontmatter?.status || "To Read";
        const currentRating = Number(frontmatter?.rating) || 0;
        const initialStatus = forcedStatus || currentStatus;

        new StatusRatingModal(this.app, file, initialStatus, currentRating, async (status, rating) => {
            try {
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    fm.status = status;
                    fm.rating = rating;
                    fm.updated = formatDateTime(new Date());

                    if (status === "Finished") {
                        if (!fm.end_date) {
                            fm.end_date = formatDate(new Date());
                        }
                    } else {
                        // Remove end_date if we move back from Finished
                        delete fm.end_date;
                    }
                });

                new Notice(`"${file.basename}" updated: ${status} (${rating}★)`);

                // Auto-refresh the master reading list in background
                await this.updateMasterReadingList(false);
            } catch (error) {
                console.error("Failed to update status and rating in frontmatter:", error);
                new Notice("Error: Failed to update book status and rating.");
            }
        }).open();
    }

    // Toggles reading status of current file (circular toggle)
    async toggleCurrentBookStatus() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("Please open a book markdown file first.");
            return;
        }
        await this.toggleBookStatus(activeFile);
    }

    // Advanced Sidebar Tool: Create and open the next volume note for a series
    async createAndOpenNextVolume(current: any) {
        // Compute next volume string
        const getNextVolume = (currentVolStr: string): string => {
            if (!currentVolStr) return "02"; // If current volume is empty, assume next is 02

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

        const nextVolume = getNextVolume(current.volume);
        const cleanSeries = sanitizeFilename(current.series.trim());
        const parentFolder = `Books/${cleanSeries}`;
        const cleanVolume = sanitizeVolume(nextVolume.trim());
        const fileName = `Vol_${cleanVolume}.md`;
        const fullPath = `${parentFolder}/${fileName}`;

        // Check if file already exists
        const fileExists = this.app.vault.getAbstractFileByPath(fullPath);
        if (fileExists) {
            new Notice(`Next volume "${fileName}" already exists! Opening it instead.`);
            if (fileExists instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(fileExists);
            }
            return;
        }

        // Create folders recursively
        await createFolderRecursively(this.app, parentFolder);

        // Generate title
        const nextTitle = `${current.series} ${nextVolume}`;
        const updatedTime = formatDateTime(new Date());

        const fileContentLines = [
            "---",
            `title: "${escapeYamlString(nextTitle)}"`,
            `status: "To Read"`,
            `author: "${escapeYamlString(current.author)}"`,
            `series: "${escapeYamlString(current.series)}"`,
            `volume: "${escapeYamlString(nextVolume)}"`,
            `category: "${escapeYamlString(current.category)}"`,
            `subcategory: "${escapeYamlString(current.subcategory)}"`,
            `rating: 0`,
            `updated: ${updatedTime}`,
            "---",
            "",
            "## Reading Notes",
            "",
            "- ",
            "",
            "## Final Review",
            "",
            ""
        ];

        const fileContent = fileContentLines.join("\n");

        try {
            const newFile = await this.app.vault.create(fullPath, fileContent);
            new Notice(`Next volume created: "${nextTitle}"`);

            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(newFile);

            await this.updateMasterReadingList(false);
        } catch (error) {
            console.error("Failed to auto-create next volume file:", error);
            new Notice("Error: Failed to auto-generate next volume.");
        }
    }

    // Generates or updates the "Master Reading List" Markdown Table
    async updateMasterReadingList(showNotification = true) {
        // Buffer delay to allow Obsidian's background indexer to parse the modified markdown file and update its metadata cache
        await new Promise(resolve => setTimeout(resolve, 300));

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
            rating: number;
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

            if (isInBooksFolder) {
                const status = frontmatter?.status || "To Read";
                const author = frontmatter?.author || "Unknown";
                const series = frontmatter?.series || "";
                const volume = frontmatter?.volume || "";
                const category = frontmatter?.category || "";
                const subcategory = frontmatter?.subcategory || "";
                const rating = Number(frontmatter?.rating) || 0;
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
                    rating,
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
        const onHold = books.filter(b => b.status === "On Hold").length;

        // Apply finished hiding filter if enabled
        const filteredBooks: BookRecord[] = [];
        let hiddenFinishedCount = 0;

        if (this.settings.enableHideFinished) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const hideDays = this.settings.hideFinishedDays;

            for (const book of books) {
                if (book.status === "Finished") {
                    let finishDate: Date | null = null;
                    if (book.endDate) {
                        const parts = book.endDate.split("-");
                        if (parts.length === 3) {
                            finishDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                        }
                    }
                    
                    if (!finishDate && book.updated) {
                        const datePart = String(book.updated).split(" ")[0];
                        const parts = datePart.split("-");
                        if (parts.length === 3) {
                            finishDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                        }
                    }

                    if (!finishDate) {
                        const mtime = new Date(book.file.stat.mtime);
                        finishDate = new Date(mtime.getFullYear(), mtime.getMonth(), mtime.getDate());
                    }

                    const diffDays = Math.floor((today.getTime() - finishDate.getTime()) / (24 * 60 * 60 * 1000));

                    if (diffDays >= hideDays) {
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
        lines.push(`- **⏸️ On Hold:** ${onHold}`);
        if (hiddenFinishedCount > 0) {
            lines.push(`- **👻 Archived/Hidden:** ${hiddenFinishedCount} (Finished books older than ${this.settings.hideFinishedDays} days are hidden from the directory list below. You can change this in the plugin settings.)`);
        }
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push("### 📊 振り返り分析 (Retrospective Analytics)");
        lines.push("");

        // 1. Category stats
        lines.push("#### 🏷️ カテゴリー別集計");
        lines.push("| カテゴリー | 読了数 / 総数 | 平均評価 | レーティング進捗 |");
        lines.push("| :--- | :---: | :---: | :--- |");

        const catMap = new Map<string, { total: number; finished: number; ratingSum: number; ratingCount: number }>();
        for (const b of books) {
            const cat = b.category.trim() || "未設定";
            if (!catMap.has(cat)) {
                catMap.set(cat, { total: 0, finished: 0, ratingSum: 0, ratingCount: 0 });
            }
            const stat = catMap.get(cat)!;
            stat.total++;
            if (b.status === "Finished") {
                stat.finished++;
            }
            if (b.rating > 0) {
                stat.ratingSum += b.rating;
                stat.ratingCount++;
            }
        }

        const catStats = Array.from(catMap.entries()).map(([name, stat]) => {
            const avgRating = stat.ratingCount > 0 ? stat.ratingSum / stat.ratingCount : 0;
            return { name, ...stat, avgRating };
        }).sort((a, b) => b.total - a.total);

        for (const cat of catStats) {
            const ratingStars = cat.avgRating > 0 ? "★" + cat.avgRating.toFixed(1) : "-";
            const barLength = 10;
            const filledLength = Math.round((cat.avgRating / 5) * barLength);
            const barStr = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);
            const pctStr = `${Math.round((cat.avgRating / 5) * 100)}%`;
            const visualBar = cat.avgRating > 0 ? `\`${barStr}\` (${pctStr})` : "-";

            lines.push(`| ${cat.name} | ${cat.finished} / ${cat.total} | ${ratingStars} | ${visualBar} |`);
        }
        lines.push("");

        // 2. Hall of Fame (★4 & ★5)
        lines.push("#### 🏆 殿堂入り (★4以上のおすすめ作品)");
        lines.push("| 作品名 | 著者 | カテゴリー | 評価 | 読了日 |");
        lines.push("| :--- | :--- | :--- | :---: | :--- |");

        const hallOfFame = books
            .filter(b => b.rating >= 4)
            .sort((a, b) => {
                if (b.rating !== a.rating) {
                    return b.rating - a.rating;
                }
                const aTime = a.endDate ? Date.parse(a.endDate) : a.updatedParsed;
                const bTime = b.endDate ? Date.parse(b.endDate) : b.updatedParsed;
                return bTime - aTime;
            });

        if (hallOfFame.length === 0) {
            lines.push("| - | - | - | - | - |");
        } else {
            for (const b of hallOfFame) {
                let displayName = b.title;
                if (b.series) {
                    displayName = b.volume ? `${b.series} (Vol ${b.volume})` : `${b.series} - ${b.title}`;
                }
                const fileLink = `[[${b.file.path}\\|${displayName}]]`;
                const ratingStars = "★".repeat(b.rating);
                lines.push(`| ${fileLink} | ${b.author} | ${b.category || "-"} | ${ratingStars} | ${b.endDate || "-"} |`);
            }
        }
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push("### 📖 Book Directory");
        lines.push("");
        lines.push("| Book / Volume | Author | Series | Vol | Category | Subcategory | Status | Rating | Last Updated | End Date |");
        lines.push("| :--- | :--- | :--- | :---: | :--- | :--- | :---: | :---: | :--- | :--- |");

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
            } else if (book.status === "On Hold") {
                statusBadge = `<span class="rrm-badge rrm-badge-on-hold">On Hold</span>`;
            } else {
                statusBadge = book.status;
            }

            const ratingStars = book.rating ? "★".repeat(book.rating) : "-";

            lines.push(`| ${fileLink} | ${book.author} | ${book.series || "-"} | ${book.volume || "-"} | ${book.category || "-"} | ${book.subcategory || "-"} | ${statusBadge} | ${ratingStars} | ${book.updated} | ${book.endDate || "-"} |`);
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

        new Setting(containerEl)
            .setName("Auto-update Master List on File Changes")
            .setDesc("Automatically rebuild the Master Reading List when a book's properties are changed in the background. Disable this to prevent Syncthing sync-conflicts.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAutoUpdate)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAutoUpdate = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
