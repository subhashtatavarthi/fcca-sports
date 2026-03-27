'use client';
export default function FileUploader({onFilesSelected}:any){
 return <input type="file" multiple onChange={(e)=>onFilesSelected(e.target.files)} />
}