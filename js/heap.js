class Element {
    constructor(name) {
        /** @type {boolean} */
        this.processed = false;
        /** @type {string} */
        this.name = name;
    }
}

class TournamentHeap {
    /** @type {Element[]} Array where the heap is stored */
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

    heapPrettyPrint() { 
        let print = "";
        //For each level
        for (let level = 0; level <= this.#maxLevel; level++) {
            //For each element in the level
            for (let i = this.#levelIndexes.get(level)[0]; i <= this.#levelIndexes.get(level)[1]; i++) {
                print += this.#getElement(i) ? this.#getElement(i).name : " -- ";
                print += " ";
            }
            print += "\n";
        }
        console.log(print);
     }

    //Get index of parent and children
    #getParentIndex(i) { return Math.floor((i - 1) / 2); }
    #getLeftChildIndex(i) { 
        let index = 2 * i;
        return index;
    }
    #getRightChildIndex(i) { 
        let index = 2 * i + 1;
        return index;
    }    

    //INFORMATION OF THE HEAP
    #getElement(i) {
        // Verify if the element exists
        if(this.#heap[i] == null) return null;
        // Verify if the element is already processed
        if (this.#heap[i].processed) return null;
        return this.#heap[i];
    }
    #setElement(i, element) { this.#heap[i] = element; }
    #heapArraySize() { return this.#heap.length; }

    #createHeap(elements) {        
        this.#heap = [];
        let arrayOfElements = elements.map(el => new Element(el));
        let amtNodes = Math.pow(2, this.#maxLevel + 1) - 1;
        let amtNodesLastLayer = Math.pow(2, this.#maxLevel);
        let amtNullValues = amtNodes - amtNodesLastLayer;

        // Step 1: push null values
        for (let i = 0; i < amtNullValues; i++) {
            this.#heap.push(null);
        }

        // Step 2: push the actual elements
        arrayOfElements.forEach(el => { this.#heap.push(el); });

        // Step 3: fill the rest with null until heap has complete amount of nodes
        while (this.#heapArraySize() < amtNodes) {
            this.#heap.push(null);
        }
    }

    // MATCHES INFORMATION
    leftContestant = () => { return this.#getElement(this.#matchIndex).name; }
    rightContestant = () => { return this.#getElement(this.#matchIndex + 1).name; }

    userWinnerIs(isLeft) {
        //We promote to the parent node the loser of the match
        this.#copyToParent(this.#matchIndex + Number(!isLeft));
        this.#goToNextMatch();
        this.heapPrettyPrint();
    }

    #copyToParent(childIndex) {
        let element = this.#getElement(childIndex);
        this.#setElement(this.#getParentIndex(childIndex), element);
    }

    #goToNextMatch() {
        let left;
        let right;
        do {
            //If we are in the upper level, we go back to the first match of the tournament
            if (this.#level == 0) {
                this.#matchIndex = this.#levelIndexes.get(this.#maxLevel)[0];
                this.#level = this.#maxLevel;
                this.#extractRootNode();
                break;
            }
            //If this was the last round, add the root node to the organized list
            if (this.#completed) console.log("Final organized list: ", this.#organizedList); // TODO: Put this in the UI

            // Go to next match
            this.#matchIndex += 2;

            //If match index is out of bounds of the level, we move to the next level
            if (this.#matchIndex > this.#levelIndexes.get(this.#level)[1]) {
                this.#level--;
                this.#matchIndex = this.#levelIndexes.get(this.#level)[0];
            }

            //If we only have one not null value, promote it
            left = this.#getElement(this.#matchIndex);
            right = this.#getElement(this.#matchIndex + 1);

            if (left != null && right == null) {
                this.#copyToParent(this.#matchIndex);
            } else if (left == null && right != null) {
                this.#copyToParent(this.#matchIndex + 1);
            }
        } //Repeat while both contestants are not null
        while (left == null || right == null);
    }

    #extractRootNode() {
        //Add the winner to the organized list
        let winner = this.#getElement(0);
        this.#organizedList.push(winner);
        
        //Initiates the process of marking elements as processed. Using the root node and its value
        this.#markAsProcessed(0, this.#getElement(0).name);

        //If all Elements are organized, we finish the tournament
        if (this.#heapArraySize() == this.#elementsAmt) {
            this.#completed = true;
        } 
    }

    /**
     * Marks nodes in the tree as processed if their name matches the given value. 
     */
    #markAsProcessed(index, value) {
        // Get the current node at the given index
        let element = this.#getElement(index);

        // If the node exists and its name matches the target value, mark it as processed and recurse into its children
        if (element && element.name == value) {
            element.processed = true;
            this.#markAsProcessed(this.#getLeftChildIndex(index), value);
            this.#markAsProcessed(this.#getRightChildIndex(index), value);
        }
    }
}