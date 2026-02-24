class TournamentHeap {
    /** @type {string[]} Array where the heap is stored */
    #heap = [];
    /** @type {number} Amount of elements */
    #elementsAmt = 0;
    /** @type {number} Number of the lowest level (starting from 0) */
    #maxLevel = 0;
    /** @type {Map<number, number[]>} Map where the key is the level and the value is the start and end index */
    #levelIndexes = new Map();
    /** @type {number} Current level */
    #level = 1;
    /** @type {number} Current match index */
    #matchIndex = 0;
    /** @type {string[]} Final organized list */
    #organizedList = [];
    /** @type {boolean} True if the tournament is completed*/
    #completed = false;


    constructor(elements = []) {
        // Set initial values
        // Get amount of elements
        this.#elementsAmt = elements.length;
        // Get max level 
        this.#maxLevel = Math.ceil(Math.log2(this.#elementsAmt));

        // Set rounds indexes
        for (let level = 0; level <= this.#maxLevel; level++) {
            let startIndex = Math.pow(2, level) - 1;
            let endIndex = Math.pow(2, level + 1) - 2;
            this.#levelIndexes.set(level, [startIndex, endIndex]);
        }

        // Set first match
        this.#matchIndex = this.#levelIndexes.get(this.#maxLevel)[0];
        this.#level = this.#maxLevel;
        // Create heap
        this.#createHeap(elements);
    }

    /**
     * Prints the current state of the heap in a human-readable format.
     */
    heapPrettyPrint() {
        let print = "";
        //For each level
        for (let level = 0; level <= this.#maxLevel; level++) {
            //For each element in the level
            for (let i = this.#levelIndexes.get(level)[0]; i <= this.#levelIndexes.get(level)[1]; i++) {
                print += this.#getElement(i) ? this.#getElement(i) : " -- ";
                print += " ";
            }
            print += "\n";
        }
        console.log(print);
    }

    //Get index of parent and children
    #getParentIndex(i) { return Math.floor((i - 1) / 2); }
    #getLeftChildIndex(i) {
        let index = 2 * i + 1;
        return index;
    }
    #getRightChildIndex(i) {
        let index = 2 * i + 2;
        return index;
    }

    //INFORMATION OF THE HEAP
    #getElement(i) { return this.#heap[i]; }
    #setElement(i, name) { this.#heap[i] = name; }
    #heapArraySize() { return this.#heap.length; }
    #organizedListSize() { return this.#organizedList.length; }

    /**
     * Creates a heap from the given array of strings.
     * @param {string[]} elements Elements to be added to the heap
     */
    #createHeap(elements) {
        this.#heap = [];
        let amtNodes = Math.pow(2, this.#maxLevel + 1) - 1;
        let amtNodesLastLayer = Math.pow(2, this.#maxLevel);
        let amtNullValues = amtNodes - amtNodesLastLayer;

        // Step 1: push null values
        for (let i = 0; i < amtNullValues; i++) {
            this.#heap.push(null);
        }

        // Step 2: push the actual elements
        elements.forEach(el => { this.#heap.push(el); });

        // Step 3: fill the rest with null until heap has complete amount of nodes
        while (this.#heapArraySize() < amtNodes) {
            this.#heap.push(null);
        }
    }

    // MATCH INFORMATION
    leftContestant = () => { return this.#getElement(this.#matchIndex); }
    rightContestant = () => { return this.#getElement(this.#matchIndex + 1); }

    /**
     * Given the result of a match, we promote the loser to the parent node.
     * @param {boolean} isLeft Is the left contestant the winner?
     */
    userWinnerIs(isLeft) {
        //We promote to the parent node the loser of the match
        this.#copyToParent(this.#matchIndex + Number(!isLeft));
        this.heapPrettyPrint();
        //Go to the next match
        this.#goToNextMatch();
    }

    /**
     * Copy the child node to the parent node
     * @param {number} childIndex 
     */
    #copyToParent(childIndex) {
        let element = this.#getElement(childIndex);
        this.#setElement(this.#getParentIndex(childIndex), element);
    }

    /**
     * Go to the next match
     */
    #goToNextMatch() {
        let left;
        let right;
        do {
            // Go to next match
            this.#matchIndex += 2;

            //If match index is out of bounds of the level, we move to the next level
            if (this.#matchIndex > this.#levelIndexes.get(this.#level)[1]) {
                this.#level--;

                //If we are in the upper level, we go back to the first match of the tournament
                if (this.#level == 0) {
                    this.#level = this.#maxLevel;
                    this.#extractRootNode();
                }

                //If this was the last element, add the root node to the organized list
                if (this.#completed) {
                    console.log("Final organized list: ", this.#organizedList); // TODO: Put this in the UI
                    break;
                }

                //Set the match index according to the level
                this.#matchIndex = this.#levelIndexes.get(this.#level)[0];
            }

            //If we only have one not null value, promote it
            left = this.#getElement(this.#matchIndex);
            right = this.#getElement(this.#matchIndex + 1);

            if (left != null && right == null) {
                this.#copyToParent(this.#matchIndex);
                this.heapPrettyPrint();
            } else if (left == null && right != null) {
                this.#copyToParent(this.#matchIndex + 1);
                this.heapPrettyPrint();
            }
        } //Repeat while both contestants are not null
        while (this.#isMatchDefined() || (left == null || right == null));
    }

    #isMatchDefined() {
        let parentI = this.#getParentIndex(this.#matchIndex);
        let element = this.#getElement(parentI);
        return element != null;
    }

    /**
     * Extracts the root node from the heap and adds it to the organized list. Initiates the process of deleting processed elements.
     */
    #extractRootNode() {
        //Add the winner to the organized list
        let winner = this.#getElement(0);
        this.#organizedList.push(winner);
        console.log("Organized list: ", this.#organizedList);

        if(this.#organizedListSize >=9){
            debugger;
        }
        //If all Elements are organized, we finish the tournament
        if (this.#organizedListSize() == this.#elementsAmt) {
            this.#completed = true;
            return;
        }

        //Initiates the process of deleting elements processed. Using the root node and its value
        this.#deleteProcessed(0, winner);
    }

    /**
     * Deletes the processed elements from the heap.
     * @param {number} index Index of the current node
     * @param {string} value Value to be deleted
     */
    #deleteProcessed(index, value) {
        // Get the current node at the given index
        let element = this.#getElement(index);
        console.log("Element: ", element, " at index: ", index);
        
        // If the node exists and its name matches the target value, mark it as null and recurse into its children
        if (element && element == value) {
            console.log("Deleting: ", element, " at index: ", index);
            this.#setElement(index, null);
            if(!this.#deleteProcessed(this.#getLeftChildIndex(index), value)){
                this.#deleteProcessed(this.#getRightChildIndex(index), value);
            }
            return true;
        }
        return false;
    }
}