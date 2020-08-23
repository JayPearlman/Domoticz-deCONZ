define([
    'app'
],

function(app) {

    var renameDeviceModal = {
        templateUrl: 'app/deCONZ/RenameModal.html',
        controllerAs: '$ctrl',
        controller: function($scope, $rootScope, apiDeCONZ) {
            var $ctrl = this;

            $ctrl.isUnchanged = true;
            $ctrl.device = Object.assign($scope.device);
            $ctrl.myname = $ctrl.device.name
            $ctrl.renameDevice = function() {

                $ctrl.isSaving = true;

                // Make api call here
                payload = new Object()
                payload.name = $ctrl.myname
                JSONpayload = angular.toJson(payload)

                // console.log('Renaming -> ' + 'deviceclass: ' + $ctrl.device.deviceclass + '\nDevice ID: ' + $ctrl.device.id + '\nBody: ' + JSONpayload);

                apiDeCONZ.setDeCONZdata($ctrl.device.deviceclass, 'PUT', $ctrl.device.id, JSONpayload)
                .then(function() {
                    // console.log('Device name updated')
                    $scope.$emit("refreshDeCONZfunc", $ctrl.device.deviceclass);
                })
                .then($scope.$close())
            }
        }
    };

    var deleteDeviceModal = {
        templateUrl: 'app/deCONZ/DeleteModal.html',
        controllerAs: '$ctrl',
        controller: function($scope, $rootScope, apiDeCONZ) {
            var $ctrl = this;

            $ctrl.device = Object.assign($scope.device);
            $ctrl.myname = $ctrl.device.name
            $ctrl.deleteDevice = function() {

                // Make api call here
                console.log('Deleting -> ' + 'deviceclass: ' + $ctrl.device.deviceclass + '\nDevice ID: ' + $ctrl.device.id );

                apiDeCONZ.setDeCONZdata($ctrl.device.deviceclass, 'DELETE', $ctrl.device.id)
                .then(function() {
                    // console.log('Device deleted')
                    $scope.$emit("refreshDeCONZfunc", $ctrl.device.deviceclass);
                })
                .then($scope.$close())

                $scope.$close()
            }
        }
    };
    
    app.component('zzDeconzPlugin', {
        templateUrl: 'app/deCONZ/index.html',
        controller: deCONZController,
    })

    app.component('zzDeconzPluginsTable', {
        bindings: {
            zigdevs: '<',
            onSelect: '&',
            onUpdate: '&'
        },
        template: '<table id="zz-deconz-plugins" class="display" width="100%"></table>',
        controller: zzDeconzPluginsTableController,
    });

    function deCONZController($uibModal, $scope, apiDeCONZ) {

        var $ctrl = this
        $ctrl.refreshDeCONZ = refreshDeCONZ;
        $ctrl.permitJoins = permitJoins;

        $ctrl.$onInit = function() {
            refreshDeCONZ('lights');
        }

        $scope.$on("refreshDeCONZfunc", function (evt, data) {
            refreshDeCONZ(data);
        });

        function refreshDeCONZ(deviceClass) {
            apiDeCONZ.getDeCONZdata(deviceClass).then(function(zigdevs) {
                // console.log('Returned Data Zigbee Devices')
                $ctrl.zigdevs = Object.values(zigdevs)
                $ctrl.value = deviceClass
                
            })
        }

        function permitJoins(seconds = 60) {
            var JSONpayload

            $ctrl.isJoining = true;
            
            payload = new Object()
            payload.permitjoin = seconds
            JSONpayload = angular.toJson(payload)

            apiDeCONZ.setDeCONZdata('config', 'PUT', '', JSONpayload).then(function() {
                // console.log('Permit Join activated')
            })
            .then($uibModal.open({
                templateUrl: 'app/deCONZ/PermitJoinsModal.html',
                controllerAs: '$mctrl',
                controller: function($scope, $interval, apiDeCONZ) {
                    var $mctrl = this;

                        $scope.countdown = seconds;

                    var timer = $interval(function () {
                        if ($scope.countdown > 0){
                            $scope.countdown--;
                        } else {
                            $ctrl.isJoining = false;
                            $interval.cancel(timer);
                            // console.log('Countdown end')
                            apiDeCONZ.getDeCONZdata($ctrl.value).then(function(zigdevs) {
                                // console.log('Returned Zigbee device data')
                                $ctrl.zigdevs = Object.values(zigdevs)
                            });
                            $scope.$close();
                        }
                    }, 1000);

                    $mctrl.endPermit = function() {
        
                        // console.log('End Permit')
        
                        payload = new Object()
                        payload.permitjoin = 0
                        JSONpayload = angular.toJson(payload)
            
                        apiDeCONZ.setDeCONZdata('config', 'PUT', '', JSONpayload).then(function() {
                            // console.log('Permit Join de-activated')
                        })
                        .then(apiDeCONZ.getDeCONZdata($ctrl.value).then(function(zigdevs) {
                            // console.log('Returned Zigbee device data')
                            $ctrl.zigdevs = Object.values(zigdevs)
                        }))

                        $ctrl.isJoining = false;

                        $scope.$close();
                    }
                }
            })
            );
        }
    }

    app.factory('apiDeCONZ', function($http, $location, $q, $rootScope, domoticzApi) {
        var requestsCount = 0;
        var requestsQueue = [];
        var apiHost = "";
        var apiPort = "";
        var apiKey = "";
        var onInit = init();

        return {
            sendRequest: sendRequest,
            getDeCONZdata: getDeCONZdata,
            setDeCONZdata: setDeCONZdata,
        };

        function init() {

            return domoticzApi.sendRequest({
                type: 'hardware',
                displayhidden: 1,
                filter: 'all',
                used: 'all'
            })
                .then(domoticzApi.errorHandler)
                .then(function(response) {
                    if (response.result === undefined) {
                        throw new Error('No Plugin devices found')
                    }

                    var apiDevice = response.result
                            .find(function(plugin) {
                            return plugin.Extra === 'deCONZ'
                        })

                    if (!apiDevice) {
                        throw new Error('No API Device found')
                    }
                    // console.log('Setting API data: ' + apiDevice.Address + '\n' + apiDevice.Port + '\n' + apiDevice.Mode2)

                    if (apiDevice.Address == '127.0.0.1' | apiDevice.Address == 'localhost') {
                        // console.log('host is: ' + $location.host())
                        apiHost = $location.host()
                    } else {
                        apiHost = apiDevice.Address
                    }
                    apiPort = apiDevice.Port
                    apiKey = apiDevice.Mode2

                    return;
                });
        }

        function getDeCONZdata(deviceClass, id = '') {
            var url;

            return onInit.then(function() {
                var deferred = $q.defer();
                // console.log('getDeCONZdata')

                if (apiKey !== "") {
                    url = 'http://' + apiHost + ':' + apiPort + '/api/' + apiKey + '/' + deviceClass + '/' + id
                    // console.log('GET API URL is: ' + url)
                    $http({
                        method: 'GET',
                        url: url,

                    }).then(function successCallback(response) {
                        // console.log('deCONZ: Data Recieved')
                        // As there is no IDX and the API requires an ID, we must add back the ID to the array
                        keys = Object.keys(response.data)
                        // loop through count
                        for (i = 0; i < keys.length; i++) {
                            // add id to each object
                            response.data[keys[i]].id = keys[i]
                            // add class type to allow puts
                            response.data[keys[i]].deviceclass = deviceClass
                        }
                        deferred.resolve(response.data)
                        },function errorCallback(response) {
                        // console.log('Error getting deCONZ data:' + response )
                        deferred.reject(response)
                    });
                }

            return deferred.promise;
        });
        }

        function setDeCONZdata(deviceClass, method, id = '', body = '') {
            var url;

            return onInit.then(function() {
                var deferred = $q.defer();
                // console.log('setDeCONZdata')

                if (apiKey !== "") {
                    url = 'http://' + apiHost + ':' + apiPort + '/api/' + apiKey + '/' + deviceClass + '/' + id
                    // console.log('SET API URL is: ' + url)
                    $http({
                        method: method,
                        url: url,
                        data: body,

                    }).then(function successCallback(response) {
                        // console.log('deCONZ: Data Recieved')
                        // console.log('response Data:' + angular.toJson(response.data, true))

                        deferred.resolve(response.data)
                        },function errorCallback(response) {
                        // console.log('Error getting deCONZ data:' + response )
                        deferred.reject(response)
                    });
                }

            return deferred.promise;
        });
        }

        function sendRequest(command, params) {
            return onInit.then(function() {
                var deferred = $q.defer();
                var requestId = ++requestsCount;

                var requestInfo = {
                    requestId: requestId,
                    deferred: deferred,
                };

                requestsQueue.push(requestInfo);

                return deferred.promise;
            });
        }

        function handleResponse(data) {
            if (data.type !== 'response' && data.type !== 'status') {
                return;
            }

            var requestIndex = requestsQueue.findIndex(function(item) {
                return item.requestId === data.requestId;
            });

            if (requestIndex === -1) {
                return;
            }

            var requestInfo = requestsQueue[requestIndex];

            if (data.type === 'status') {
                requestInfo.deferred.notify(data.payload);
                return;
            }

            if (data.isError) {
                requestInfo.deferred.reject(data.payload);
            } else {
                requestInfo.deferred.resolve(data.payload);
            }
            
            requestsQueue.splice(requestIndex, 1);
        }
    })

    function zzDeconzPluginsTableController($scope, $uibModal, $element, bootbox, dataTableDefaultSettings) {
        var $ctrl = this;
        var table;

        $ctrl.$onInit = function() {
            table = $element.find('table').dataTable(Object.assign({}, dataTableDefaultSettings, {
                autoWidth: false,
                order: [[2, 'asc']],
                paging: true,
                columns: [
                    { title: 'ID', data: 'uniqueid', "defaultContent": "" },
                    { title: 'Name', data: 'name'},
                    { title: 'Manufacturer', data: 'manufacturername', "defaultContent": "" },
                    { title: 'Model', data: 'modelid', "defaultContent": "" },
                    { title: 'Type', data: 'type'},
                    { title: 'Firmware', data: 'swversion', "defaultContent": "" },
                    { title: 'Last Seen', data: 'lastseen', "defaultContent": "" },
                    
                    {
                        title: '',
                        className: 'actions-column',
                        width: '80px',
                        data: '',
                        orderable: false,
                        render: actionsRenderer
                    },
                ],
            }));

            table.on('click', '.js-rename-device', function() {
                var row = table.api().row($(this).closest('tr')).data();
                var scope = $scope.$new(true);
                scope.device = row;

                $uibModal
                    .open(Object.assign({ scope: scope }, renameDeviceModal)).result.then(closedCallback, dismissedCallback);

                    function closedCallback(){
                      // Do something when the modal is closed
                    //   console.log('closed callback')
                    }
                
                    function dismissedCallback(){
                      // Do something when the modal is dismissed
                    //   console.log('cancelled callback')
                    }

                $scope.$apply();

            });

            table.on('click', '.js-device-data', function() {
                var device = table.api().row($(this).closest('tr')).data();

                bootbox.alert('<pre>' + angular.toJson(device, true) + '</pre>')
            });

            table.on('click', '.js-remove-device', function() {
                var row = table.api().row($(this).closest('tr')).data();
                var scope = $scope.$new(true);
                scope.device = row;

                $uibModal
                    .open(Object.assign({ scope: scope }, deleteDeviceModal))

                $scope.$apply();
            });

            render($ctrl.zigdevs);
        }

        $ctrl.$onChanges = function(changes) {
            if (changes.zigdevs) {
                render($ctrl.zigdevs);
            }
        };

        function render(items) {
            if (!table || !items) {
                return;
            }

            table.api().clear();
            table.api().rows
                .add(items)
                .draw();
        }

        function actionsRenderer(value, type, device) {
            var actions = [];
            var delimiter = '<img src="../../images/empty16.png" width="16" height="16" />';

            actions.push('<button class="btn btn-icon js-rename-device" title="' + $.t('Rename Device') + '"><img src="images/rename.png" /></button>');
            actions.push('<button class="btn btn-icon js-device-data" title="' + $.t('Device Data') + '"><img src="images/log.png" /></button>');
            actions.push('<button class="btn btn-icon js-remove-device" title="' + $.t('Remove') + '"><img src="images/delete.png" /></button>');

            return actions.join('&nbsp;');
        }
    }
});