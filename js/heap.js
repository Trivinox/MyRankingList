class Element {
    constructor(name) {
        /** @type {string} */
        this.name = name;
        /** @type {boolean} */
        this.processed = false;
    }
}

class TournamentHeap {
    /**
     * @param {string[]} elements - Array of the elements names (minimum 3)
     */
    constructor(elements = []) {
        this.maxLayer = Math.ceil(Math.log2(elements.length));
        this.#createHeap(elements);
        this.round = 1;
        this.matchNumber = 1;
    }

    //Get information of the heap
    /**
     * 
     * @param {number} i - Index of the element
     * @returns Element in the index given
     */
    #getElement(i) {return this.heap[i];}
    get size() { return this.heap.length; }
    /**
     * 
     * @param {number} i - Index of the Element
     * @returns {string} Name of the Element
     */
    #getName(i) { return this.heap(i).name; }

    // Matches
    /**
     * 
     * @param {number} round Round number (starting on 1)
     * @param {number} matchNumber Match of the round (starting on 1)
     * @returns {string} Name of the first contestant (left)
     */
    leftContestant() { return this.#getContestant(false).name; }
    /**
     * 
     * @param {number} round Round number (starting on 1)
     * @param {number} matchNumber Match of the round (starting on 1)
     * @returns {string} Name of the second contestant (right)
     */
    rightContestant() { return this.#getContestant(true).name; }
    /**
     * @param {number} round - Round number (starting on 1)
     * @param {number} matchNumber - Match of the round (starting on 1)
     * @param {boolean} isFirst - true for first contestant, false for second
     * @returns Index of the contestant
     */
    #getContestant(isFirst) {
        if (this.matchNumber > this.#getMaxMatchesInRound(this.round)) {
            console.log("Impossible to get the match from this round")
            return ["", ""]
        }
        let layer = this.maxLayer + 1 - this.round;
        let firstInLayer = Math.pow(2, layer) - 1;
        console.log("layer: " + layer);
        console.log("firstInLayer: " + firstInLayer);
        console.log ("returning: " + (firstInLayer + Number(isFirst)) + " because isfirst is " + isFirst);
        return this.heap[firstInLayer  + Number(isFirst)];
    }
    /**
     * 
     * @param {number} round - Number of round (starting in 1)
     * @returns {number} Amount of rounds possible in that round
     */
    #getMaxMatchesInRound() {
        let layer = this.maxLayer + 1 - this.round;
        let firstInLayer = Math.pow(2, layer) - 1;
        let lastInLayer = Math.pow(2, layer + 1) - 2;
        let maxRounds = Math.pow(2, layer) / 2;
        for (let i = lastInLayer; i >= firstInLayer; i -= 2) {
            if (this.#getElement(i - 1) == null || this.#getElement(i) == null) {
                maxRounds --;
            } else break;
        }
        return maxRounds;
    }

    //Get index of parent and children
    /**
     * @param {number} i - Index of node to find it's parent
     * @returns {number} Index of parent     */
    #getParentIndex(i) { return Math.floor((i - 1) / 2); }
    /**
     * @param {number} i - Index of node to find it's left childen
     * @returns {number} Index of left childen     */
    #getLeftChildIndex(i) { return 2 * i + 1; }
    /**
     * @param {number} i - Index of node to find it's right childen
     * @returns {number} Index of right childen
     */
    #getRightChildIndex(i) { return 2 * i; }

    /**
     * @param {string[]} elements - Array of strings to add to the bottom of the heap as Elements
     */
    #createHeap(elements) {        
        this.heap = [];
        let arrayOfElements = elements.map(el => new Element(el));
        let amtNodes = Math.pow(2, this.maxLayer + 1) - 1;
        let amtNodesLastLayer = Math.pow(2, this.maxLayer);
        let amtNullValues = amtNodes - amtNodesLastLayer;

        // Step 1: push null values
        for (let i = 0; i < amtNullValues; i++) {
            this.heap.push(null);
        }

        // Step 2: push the actual elements
        arrayOfElements.forEach(el => { this.heap.push(el); });

        // Step 3: fill the rest with null until heap has complete amount of nodes
        while (this.heap.length < amtNodes) {
            this.heap.push(null);
        }
    }

    /**
     * 
     * @param {number} index - Index of the Element on the heap
     * @returns {string} Name of the Element
     */
    #promote(index) {
        let element = this.#getElement(index);
        if (element == null || element.processed)
            return null;
        return element.name;
    }
}