export const getMimeType = (format: string) => {
  switch (format.toLowerCase()) {
    case 'stl':
      return 'model/stl';
    case 'step':
    case 'stp':
      return 'model/step';
    case 'glb':
      return 'model/gltf-binary';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
};
