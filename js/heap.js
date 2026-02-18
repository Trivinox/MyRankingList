class Element {
    constructor(name) {
        /** @type {boolean} */
        this.processed = false;
        /** @type {string} */
        this.name = name;
    }
}

class TournamentHeap {
    #elementsAmt = 0;
    #maxRounds = 0;
    #matchNumber = 1;
    #round = 1;
    #organizedList = [];
    #completed = false;
    /**
     * @param {string[]} elements - Array of the elements names (minimum 3)
     */
    constructor(elements = []) {
        this.#elementsAmt = elements.length;
        this.#maxRounds = Math.ceil(Math.log2(this.#elementsAmt));
        this.#createHeap(elements);
        this.prettyPrintHeap();
    }
    
    //For testing purposes, to see the heap in a more visual way
    prettyPrintHeap(){
        let layer = 1;
        let firstInLayer = 0;
        let lastInLayer = 0;
        while (firstInLayer < this.heap.length) {
            lastInLayer = Math.min(firstInLayer + Math.pow(2, layer - 1) - 1, this.heap.length - 1);
            let row = "";
            for (let i = firstInLayer; i <= lastInLayer; i++) {
                if (this.heap[i]) {
                    row += this.heap[i].name + " ";
                } else {
                    row += "-- ";
                }
            }
            console.log(row);
            firstInLayer = lastInLayer + 1;
            layer++;
        }
    }

    //Get information of the heap
    /**
     * 
     * @param {number} i - Index of the element
     * @returns Element in the index given
     */
    #getElement(i) {
        //Verify if index is null
        if (i == null) {
            return new Element("No element");
        }
        return this.heap[i];
    }
    #setElement(i, element) {this.heap[i] = element;}
    get size() { return this.heap.length; }

    // Matches
    /**
     * 
     * @returns {string} Name of the first contestant (left)
     */
    leftContestant = () => { 
        //Verify if is completed, if it is, we give error and return null
        if (this.#completed) {
            console.error("Tournament is already completed");
            return null;
        }
        return this.#getContestantElement(false).name; 
    }
    /**
     * 
     * @returns {string} Name of the second contestant (right)
     */
    rightContestant = () => { 
        //Verify if is completed, if it is, we give error and return null
        if (this.#completed) {
            console.error("Tournament is already completed");
            return null;
        }
        return this.#getContestantElement(true).name; 
    }
    /**
     * @param {number} round - Round number (starting on 1)
     * @param {number} #matchNumber - Match of the round (starting on 1)
     * @param {boolean} isLeft - true for first contestant, false for second
     * @returns {number} Index of the contestant in the heap array
     */
    #getContestantIndex(isLeft) {
        if (this.#matchNumber > this.#maxMatches()) {
            console.error("Match number is higher than the maximum matches in that round");
            return null;
        }
        let layer = this.#maxRounds + 1 - this.#round;
        let firstInLayer = Math.pow(2, layer) - 1;
        let shiftIndex = (this.#matchNumber - 1) * 2; // Shift to the right according to the match
        return firstInLayer + shiftIndex + Number(isLeft);
    }    
    /**
     * 
     * @param {boolean} isLeft - Is the left contextant of this match
     * @returns {Element} Element for the contestant
     */
    #getContestantElement(isLeft) { return this.#getElement(this.#getContestantIndex(isLeft)); }

    /**
     * @returns Parent Index for both contestants
     */
    #getContestantsParentIndex() {return this.#getParentIndex(this.#getContestantIndex(true));}

    /**
     * 
     * @returns {number} Amount of matches in the round with both contestants
     */
    #maxMatches = () => {
        let layer = this.#maxRounds + 1 - this.#round;
        let firstInLayer = Math.pow(2, layer) - 1;
        let lastInLayer = Math.pow(2, layer + 1) - 2;
        let maxMatches = Math.pow(2, layer) / 2;
        for (let i = lastInLayer; i >= firstInLayer; i -= 2) {
            if (this.#getElement(i - 1) == null || this.#getElement(i) == null) {
                maxMatches--;
            } else break;
        }
        return maxMatches;
    };

    /**
     * 
     * @returns {number} Amount of matches in the round even with null values
     */
    #totalMatches = () => {
        let layer = this.#maxRounds + 1 - this.#round;
        return Math.pow(2, layer) / 2;
    };

    //Get index of parent and children
    /**
     * @param {number} i - Index of node to find it's parent
     * @returns {number} Index of parent     */
    #getParentIndex(i) { return Math.floor((i - 1) / 2); }
    /**
     * @param {number} i - Index of node to find it's left childen
     * @returns {number} Index of left childen     */
    #getLeftChildIndex(i) { 
        let index = 2 * i;
        if (index >= this.heap.length) {
            return null;
        }
        return index;
    }
    /**
     * @param {number} i - Index of node to find it's right childen
     * @returns {number} Index of right childen
     */
    #getRightChildIndex(i) { 
        let index = 2 * i + 1;
        if (index >= this.heap.length) {
            return null;
        }
        return index;
    }

    /**
     * @param {string[]} elements - Array of strings to add to the bottom of the heap as Elements
     */
    #createHeap(elements) {        
        this.heap = [];
        let arrayOfElements = elements.map(el => new Element(el));
        let amtNodes = Math.pow(2, this.#maxRounds + 1) - 1;
        let amtNodesLastLayer = Math.pow(2, this.#maxRounds);
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
     * @returns {Element} The Element at the given index
     */
    #promote(index) {
        let element = this.#getElement(index);
        if (element == null || element.processed)
            return null;
        return element;
    }
    
    /**
     * @param {boolean} isLeft - true if the left contestant won, false if the right contestant won
     */
    userWinnerIs(isLeft) {
        //Verify it is not completed
        if (this.#completed) {
            console.error("Tournament is already completed");
            return;
        }
        //We promote to the parent node the loser of the match
        this.#copyToParent(this.#getContestantIndex(!isLeft)); 
        this.#goToNextMatch();
    }

    #copyToParent(childIndex){
        let element = this.#getElement(childIndex);
        this.#setElement(this.#getParentIndex(childIndex), element);
    }

    /**
     * Move to the next match, and if it's the end of the round, move to the next round
     */
    #goToNextMatch() {
        this.prettyPrintHeap();
        console.log("Next match. Round: " + this.#round + ", Match: " + this.#matchNumber);
        //If this was the last round, complete the tournament
        if (this.#round == this.#maxRounds) {
            this.#completeTournament();
        } else {
            //If is the last match of the round, we move to the next round
            if (this.#matchNumber >= this.#maxMatches()) {
                //Declare promotions next odd value
                if(this.#maxMatches < this.#totalMatches){
                    this.#copyToParent(this.#getRightChildIndex + 1);
                }
                this.#round++;
                this.#matchNumber = 1;
            } //If not, we just move to the next match
            else {
                this.#matchNumber++;
            }
        }
    }

    #completeTournament() {
        //If is last round, we add the winner to the organized list
        let winner = this.#getElement(0);
        this.#organizedList.push(winner);

        //If all Elements are organized, we finish the tournament
        if (this.#organizedList.length == this.#elementsAmt) {
            this.#completed = true;
        } else this.#markElementsAsProcessed(0);
    }

    #markElementsAsProcessed(index) {
        let element = this.#getElement(index);
        //Mark element as processed
        if (element) {
            element.processed = true;
            //Mark children as processed
            this.#markElementsAsProcessed(this.#getLeftChildIndex(index));
            this.#markElementsAsProcessed(this.#getRightChildIndex(index));
        }
    }
}