'use strict';

/* Directives */

angular
.module('cycle.directives', [])
.directive('cycleTree', function(App, Event, $http) {
  return {
    restrict: "A",
    replace: false,
    transclude: false,
    require: '?connector',
    scope: {
      'connector' : "=",
      'selected' : "=",
      'id' : "@"
    },
    link: function(scope, element, attrs, model) {
      
      /**
       * Pre bootstraping the tree (loading root elements)
       * and displaying the tree to the user
       */
      function preBootstrapTree(Memory, ObjectStoreModel, Tree, Deferred, Observable, registry) {
        
        // id of the current connector
        var connectorId = null;
        
        function removeTree() {
          var treeWidget = registry.byId(attrs.id);
          if (treeWidget) {
            registry.byId(attrs.id).destroy();
            registry.remove(attrs.id);
          }
        }

        function handleTreeError(error) {
          removeTree();
          scope.$emit(Event.componentError, error);
        }

        function getRootContents(connectorId) {
          var deferred = new Deferred();

          $http.get(App.uri("secured/resource/connector/" + connectorId + "/root"))
            .success(function(data, status, headers, config) {
              deferred.resolve(data);
            })
            .error(function(data, status, headers, config) {
              handleTreeError(data);
              deferred.reject(data);
            });

          return deferred.promise;
        }

        function getNodeContents(node) {
          var deferred = new Deferred();

          $http.get(App.uri("secured/resource/connector/" + connectorId + "/children?nodeId=" + encodeURI(node.id)))
            .success(function(data, status, headers, config) {
              deferred.resolve(data);
            })
            .error(function(data, status, headers, config) {
              handleTreeError(data);
              deferred.reject(data);
            });
          return deferred.promise;
        }
        
        /**
         * Actual function performing the tree bootstrap
         * after the trees root elements have been loaded
         */
        function bootstrapTree(roots) {
          var memoryStore = new Memory({
            data: roots,
            getChildren: getNodeContents
          });

          // Create the model
          var treeModel = new ObjectStoreModel({
            store: new Observable(memoryStore),
            query: {id: '/'},
            labelAttr : "label",
            mayHaveChildren: function(item) {
              return item.type == "FOLDER";
            }
          });

          // remove old tree
          removeTree();

          var tree = new Tree({
            id: attrs.id,
            model: treeModel,
            openOnClick: false,
            onClick: function(item, node) {
              if (node.isExpandable) {
                this._onExpandoClick({node: node});
              }

              if (item.type == "BPMN_FILE" || item.type == "FOLDER") {
                
                // FIXME digest should to the $apply, 
                // but obviously its not resulting in a model update for the add button binding
                // probably a bug in angularjs ?
                // if you change something here, please test the following:
                // first enter the modeler name, THEN select the file, add button should be enabled
                // not working without $apply after digest, $apply function must be empty also
                scope.selected = item;
                scope.$digest();
                scope.$apply();
              } else {
                // FIXME see description above!
                scope.selected = null;
                scope.$digest();
                scope.$apply();
              }
            },
            showRoot: false,
            persist: false
          });

          tree.placeAt(element[0]);
          tree.startup();
        }

        // actual pre bootstrap code whenever 
        // selected connector changes
        scope.$watch("connector", function (newValue, oldValue) {
          if (!newValue) {
            return;
          }

          if (newValue != oldValue) {
            if (oldValue) {
              scope.$emit(Event.selectedConnectorChanged);
            }
            
            connectorId = newValue.connectorId;
            
            getRootContents(connectorId)
              .then(bootstrapTree, handleTreeError);
          }
        });
      }
      
      // Bootstrap the dojo tree
      require(["dojo/store/Memory",
               "dijit/tree/ObjectStoreModel", 
               "dijit/Tree",
               "dojo/Deferred",
               "dojo/store/Observable",
               "dijit/registry"], preBootstrapTree);
    }
  };
})
.directive('ngCombobox', function(Event) {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function (scope, elm, attrs, model) {
      if (model) {
        elm.on(Event.ngChange, function() {
          scope.$apply(function() {
            var input = getInputText();
            if (input) {
              // catch user typed values (not selected ones)
              model.$setViewValue(input.value);
            }
          });
        });
      }

      // value list changed, update combobox
      scope.$watch(attrs.values, function() {
        var comboboxContainer = getComboboxContainer();
        if (comboboxContainer) {
          // combobox already presents, remove old one
          var select = elm.detach();
          $(comboboxContainer).parent().prepend(select);
          $(comboboxContainer).remove();
        }
        // init new combobox
        elm.combobox({
          template: '<div class="combobox-container"><input type="text" autocomplete="off" class="dropdown-toggle" /><span class="" data-dropdown="dropdown"></span></div>'
        });
      });

      // update input with model when default value is set
      scope.$watch(model, function() {
        var input = getInputText();
        if (input) {
          var oldValue = input.value;
          if (oldValue !== model.$modelValue) {
            $(input).val(model.$modelValue);
          }
        }
      });

      // do some cleanup
      scope.$on(Event.destroy, function () {
        $('ul.typeahead.dropdown-menu').each(function(){
          $(this).remove();
        });
        elm.unbind($().combobox());
      });

      // get container which holds the combobox elements
      function getComboboxContainer() {
        var comboboxContainer = elm.parent('.combobox-container');
        if (comboboxContainer.length == 1) {
          return comboboxContainer[0];
        } else {
          return;
        }
      }

      // get combobox's input text
      function getInputText() {
        var comboboxContainer = getComboboxContainer();
        if (comboboxContainer) {
          var input = $(comboboxContainer).children('input')[0];
          if (input) {
            return input;
          }
        }

        return;
      }
    }
  };
})
/**
 * Realizes a bpmn diagram ui component in the roundtrip details dialog.
 * 
 * @param roundtrip reference to the roundtrip the diagram belongs to
 * @param diagram or null the diagram which is managed / displayed
 * @param identifier the identifier of the diagram (eighter leftHandSide or rightHandSide)
 * 
 * Usage:
 * 
 * <bpmn-diagram handle="leftDiagram" roundtrip="myRoundtrip" diagram="myRoundtrip.leftHandSide" identifier="leftHandSide" />
 */
.directive("bpmnDiagram", function(App) {
  return {
    restrict: 'E',
    scope: {
      roundtrip: '=', 
      diagram: '=',
      handle : '@',
      identifier: '@'
    }, 
    templateUrl: App.uri("secured/view/partials/bpmn-diagram.html"),
    controller: 'BpmnDiagramController', 
    link: function(scope, element, attrs) {
      scope.identifier = attrs.identifier;
      if (attrs.handle) {
    	  scope.$parent[attrs.handle] = scope;
   	  }
    }
  };
})
.directive("help", function(App) {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var help = attrs.help, 
          helpTitle = attrs.helpTitle, 
          colorInvert = !!attrs.colorInvert;
      
      var helpToggle = $('<span class="help-toggle"><i class="icon-question-sign' + (colorInvert ? ' icon-white' : '') + '"></i></span>');
      helpToggle
        .appendTo(element)
        .popover({content: help, title: helpTitle, delay: { show: 0, hide: 0 }});
    }
  };
})
.directive("diagramImage", function(App, Commons) {
  return {
    restrict: 'E',
    replace : true,
    scope : {
      diagram: "=",
      status: "=", 
      click: "&"
    },
    templateUrl: App.uri("secured/view/partials/diagram-image.html"),
    link: function(scope, element, attrs) {

      function changeImageStatus(newStatus) {
          scope.status = newStatus;
          
          // FIXME workaround for a angular bug!
          scope.$digest();
          scope.$apply();
      }
      
      function performImageClick() {
        scope.$apply(function() {
          scope.click();
        });
      }
      
      function fixDiagramImageHeight(element) {
        // fix image height if it is higher than the diagram container
        var e = $(element);
        var imgHeight = parseInt(e.css("height"), 10);
        var containerHeight = parseInt(e.parents(".diagram").css("height"), 10);

        if (imgHeight > containerHeight) {
          e.css("height", containerHeight + "px");
        }
      }
      
      // register image load interceptor
      $(element)
        .find("img")
        .css({ width: "auto", height: "auto" })
        .bind({
          load: function() {
            fixDiagramImageHeight(this);
            changeImageStatus("LOADED");
          },
          error: function(){
            changeImageStatus("UNAVAILABLE");
          }, 
          click: performImageClick
        });

      // $scope.checkImageAvailable();
//      scope.checkImageAvailable = function () {
//        if (scope.diagram) {
//          Commons.isImageAvailable(scope.diagram.connectorNode).then(function (data) {
//            scope.imageAvailable = data.available && ((data.lastModified + 5000) >= scope.diagram.lastModified);
//            scope.$emit(Event.imageAvailable, scope.imageAvailable, scope.identifier);
//          });
//        }
//      };

      function updateImage(diagram, update) {
        scope.status = "LOADING";
        $(element).find("img").attr("src", Commons.getImageUrl(diagram.connectorNode, update));
      };

      scope.$watch("diagram", function (newDiagramValue) {
        if (newDiagramValue) {
          updateImage(scope.diagram);
        }
      });

      /**
       * Update image status when it is set back to unknown
       */
      scope.$watch("status", function (newStatus, oldStatus) {
        if (scope.diagram && newStatus == "UNKNOWN" && oldStatus) {
          updateImage(scope.diagram, true);
        }
      });
    }
  };
})

/**
 * A directive which conditionally displays a dialog 
 * and allows it to control it via a explicitly specified model.
 * 
 * <dialog model="aModel">
 *   <div class="model" ngm-if="aModel.renderHtml()">
 *     <!-- dialog contents ... -->
 *   </div>
 * </dialog>
 * 
 * <script>
 *   // outside the dialog
 *   aModel.open(); // openes the dialog (asynchronously)
 *   aModel.close(); // closes the dialog (immediately)
 *   
 *   // Or inside the dialog: 
 *   $model.close();
 * </script>
 */
.directive('dialog', function($http, $timeout) {
  return {
    restrict: 'E',
    scope: {
      $model: '=model'
    }, 
    transclude: true, 
    template: '<div ng-transclude />', 
    link: function(scope, element, attrs) {
      /**
       * Obtain the dialog
       * @returns the dialog instance as a jQuery object
       */
      function dialog() {
        return angular.element(element.find(".modal"));
      }
      
      /**
       * Obtain the dialogs model
       * @returns the dialogs model
       */
      function model() {
        return scope.$model;
      }
      
      /**
       * Init (ie. register events / dialog functionality) and show the dialog.
       * @returns nothing
       */
      function initAndShow() {
        
        var options = model().autoClosable ? {} : {
          backdrop: 'static', 
          keyboard: false
        };
        
        dialog()
          .hide()
          // register events to make sure the model is updated 
          // when things happen to the dialog. We establish a two-directional mapping
          // between the dialog model and the bootstrap modal. 
          .on('hidden', function() {
            // Model is still opened; refresh it asynchronously
            if (model().status != "closed") {
              $timeout(function() {
                model().status = "closed";
              });
            }
          })
          .on('shown', function() {
            model().status = "open";
          })
          // and show modal
          .modal(options);
      }

      /**
       * Hide (and destroys) the dialog
       * @returns nothing
       */
      function hide() {
        dialog().modal("hide");
      }
      
      /**
       * Watch the $model.status property in order to map it to the 
       * bootstrap modal dialog live cycle. The HTML has to be rendered first, 
       * for the dialog to appear and actual stuff can be done with the dialog.
       */
      scope.$watch("$model.status", function(newValue , oldValue) {
        
        // dialog lifecycle
        // closed -> opening -> open -> closing -> closed
        //            ^ html is about to exist       ^ dialog closed (no html)
        //                       ^ dialog operational and displayed
        //  ^ dialog closed (no html)    ^ dialog closing
        switch (newValue) {
          case "opening": 
            // dialog about to show and markup will be ready, soon
            // asynchronously initialize dialog and register events            
            $timeout(initAndShow);
            break;
          case "closing": 
            hide();
            break;
        }
      });
    }
  };
});

/** 
 * Dialog model to be used along with the 
 * dialog directive and attaches it to the given scope
 */
function Dialog() {
  
  var self = this;
  self.status = "closed";
  self.autoClosable = true;
  
  this.open = function() {
    self.status = "opening";
  };

  this.close = function() {
    self.data = {};
    self.status = "closing";
  };

  this.setAutoClosable = function(closable) {
    self.autoClosable = closable;
  };
  
  this.renderHtml = function() {
    return self.status != "closed";
  };
};
