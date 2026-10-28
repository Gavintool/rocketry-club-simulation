import {simulate} from './simulation.js';
self.onmessage=({data:{id,parameters}})=>{
  try{self.postMessage({id,result:simulate(parameters)});}
  catch(error){self.postMessage({id,error:error.message});}
};
