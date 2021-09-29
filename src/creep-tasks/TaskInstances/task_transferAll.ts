import { Task } from '../Task';


export type transferAllTargetType = StructureStorage | StructureTerminal | StructureContainer;

export class TaskTransferAll extends Task {

	static taskName = 'transferAll';
	// @ts-ignore
	target: transferAllTargetType;

	data: {
		skipEnergy?: boolean;
	};

	constructor(target: transferAllTargetType, skipEnergy = false, options = {} as TaskOptions) {
		super(TaskTransferAll.taskName, target, options);
		this.data.skipEnergy = skipEnergy;
	}

	isValidTask() {
		for (let resourceType in this.creep.carry) {
			if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
				continue;
			}
			let amountInCarry = this.creep.carry[<ResourceConstant>resourceType] || 0;
			if (amountInCarry > 0) {
				return true;
			}
		}
		return false;
	}

	isValidTarget() {
		return this.target.store.getFreeCapacity() > 0;
	}

	work() {
		for (let resourceType in this.creep.carry) {
			if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
				continue;
			}
			let amountInCarry = this.creep.carry[<ResourceConstant>resourceType] || 0;
			if (amountInCarry > 0) {
				return this.creep.transfer(this.target, <ResourceConstant>resourceType);
			}
		}
		return -1;
	}
}
